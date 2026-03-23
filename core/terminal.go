package core

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/aymanbagabas/go-pty"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Terminal manages a PTY-backed shell process.
// Uses ConPTY on Windows and /dev/ptmx on Linux/macOS.
type Terminal struct {
	ctx context.Context
	ptm pty.Pty
}

// NewTerminal creates an uninitialised Terminal.
func NewTerminal() *Terminal {
	return &Terminal{}
}

// StartWithID launches the shell inside a PTY and streams its output to the
// frontend via the scoped "terminal-output:{id}" event.
// If shell is empty the best available shell is used.
func (t *Terminal) StartWithID(ctx context.Context, id, shell string) error {
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
	cmd := ptm.Command(shell, args...)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	if err := cmd.Start(); err != nil {
		ptm.Close()
		return fmt.Errorf("cmd.Start: %w", err)
	}

	// Read loop: forward PTY output to the frontend using the scoped event name.
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptm.Read(buf)
			if n > 0 {
				wailsRuntime.EventsEmit(t.ctx, "terminal-output:"+id, string(buf[:n]))
			}
			if err != nil {
				if err != io.EOF {
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
		t.ptm.Close()
	}
}
