package pty

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"

	"github.com/aymanbagabas/go-pty"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"myterm/internal/domain"
)

// Terminal manages a PTY-backed shell process.
// Uses ConPTY on Windows and /dev/ptmx on Linux/macOS.
type Terminal struct {
	ctx    context.Context
	ptm    pty.Pty
	closed atomic.Bool // set by Close() so the read goroutine won't emit a redundant terminal-exit event
}

// Ensure Terminal implements ITerminal
var _ domain.ITerminal = (*Terminal)(nil)

// NewTerminal creates an uninitialised Terminal.
func NewTerminal() *Terminal {
	return &Terminal{}
}

// StartWithID launches the shell inside a PTY and streams its output to the
// frontend via the scoped "terminal-output:{id}" event.
// If shell is empty the best available shell is used.
func (t *Terminal) StartWithID(ctx context.Context, id, shell string, cwd string) error {
	t.ctx = ctx

	ptm, err := pty.New()
	if err != nil {
		return fmt.Errorf("pty.New: %w", err)
	}
	t.ptm = ptm

	if shell == "" {
		shell = BestShell()
	}
	args := ShellArgs(shell)

	// Ensure the shell is an absolute path. If it's a bare name like "cmd.exe",
	// go-pty or exec.Cmd might leave it as relative, and cmd.Start() will try
	// to resolve it against cmd.Dir, resulting in "file does not exist" errors.
	if absShell, err := exec.LookPath(shell); err == nil {
		shell = absShell
	}

	cmd := ptm.Command(shell, args...)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	if strings.HasPrefix(cwd, "~") {
		if home, err := os.UserHomeDir(); err == nil {
			if cwd == "~" {
				cwd = home
			} else if len(cwd) > 1 && (cwd[1] == '/' || cwd[1] == '\\') {
				cwd = filepath.Join(home, cwd[2:])
			}
		}
	}
	if cwd != "" {
		cmd.Dir = cwd
	}

	if err := cmd.Start(); err != nil {
		ptm.Close()
		return fmt.Errorf("cmd.Start: %w", err)
	}

	// Read loop: forward PTY output to the frontend using the scoped event name.
	go func() {
		buf := make([]byte, 32768) // 32 KiB — handles full-screen redraws without excessive IPC round-trips
		for {
			n, err := ptm.Read(buf)
			if n > 0 {
				wailsRuntime.EventsEmit(t.ctx, "terminal-output:"+id, string(buf[:n]))
			}
			if err != nil {
				// Only emit terminal-exit when the process died on its own.
				// If Close() was called first (t.closed == true) the SessionManager
				// already emitted terminal-exit:id — don't do it twice.
				if err != io.EOF && !t.closed.Load() {
					wailsRuntime.EventsEmit(t.ctx, "terminal-exit:"+id, err.Error())
				}
				return
			}
		}
	}()

	return nil
}

// Write injects raw data (keystrokes, escape sequences) into the PTY stdin.
func (t *Terminal) Write(data string) error {
	if t.ptm == nil {
		return fmt.Errorf("terminal not started")
	}
	_, err := t.ptm.Write([]byte(data))
	return err
}

// Resize adjusts the PTY dimensions so ncurses/readline redraws correctly.
func (t *Terminal) Resize(cols, rows int) error {
	if t.ptm == nil {
		return nil
	}
	return t.ptm.Resize(cols, rows)
}

// Close shuts down the PTY and the shell process.
func (t *Terminal) Close() {
	if t.ptm != nil {
		t.closed.Store(true) // signal read goroutine not to emit terminal-exit
		t.ptm.Close()
	}
}
