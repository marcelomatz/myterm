package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/aymanbagabas/go-pty"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Terminal manages a PTY-backed shell process.
// Uses ConPTY on Windows and /dev/ptmx on Linux/macOS.
type Terminal struct {
	ctx context.Context
	ptm pty.Pty
}

// newTerminal creates an uninitialised Terminal.
func newTerminal() *Terminal {
	return &Terminal{}
}

// DetectShells returns the list of available shell binaries on this system.
func DetectShells() []string {
	var shells []string
	switch runtime.GOOS {
	case "windows":
		// Named executables found via PATH.
		pathCandidates := []string{"wsl.exe", "pwsh.exe", "powershell.exe", "cmd.exe"}
		for _, c := range pathCandidates {
			if _, err := exec.LookPath(c); err == nil {
				shells = append(shells, c)
			}
		}
		// Git Bash / MSYS2 / Cygwin — bash.exe lives under fixed install dirs,
		// not necessarily on PATH.
		bashPaths := []string{
			`C:\Program Files\Git\bin\bash.exe`,
			`C:\Program Files\Git\usr\bin\bash.exe`,
			`C:\Program Files (x86)\Git\bin\bash.exe`,
			`C:\msys64\usr\bin\bash.exe`,
			`C:\msys32\usr\bin\bash.exe`,
			`C:\cygwin64\bin\bash.exe`,
			`C:\cygwin\bin\bash.exe`,
		}
		// Also check PROGRAMFILES env in case Git is installed to a custom dir.
		if pf := os.Getenv("PROGRAMFILES"); pf != "" {
			gitPath := pf + `\Git\bin\bash.exe`
			// Prepend so it's preferred over e.g. msys64 if present.
			bashPaths = append([]string{gitPath}, bashPaths...)
		}
		for _, p := range bashPaths {
			if _, err := os.Stat(p); err == nil {
				shells = append(shells, p)
				break // prefer the first match (usually Program Files)
			}
		}
	default:
		candidates := []string{"/bin/zsh", "/bin/bash", "/bin/sh", "/usr/bin/fish"}
		// Also honour $SHELL if it isn't already in the list.
		if s := os.Getenv("SHELL"); s != "" {
			found := false
			for _, c := range candidates {
				if c == s {
					found = true
					break
				}
			}
			if !found {
				candidates = append([]string{s}, candidates...)
			}
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				shells = append(shells, c)
			}
		}
	}
	if len(shells) == 0 {
		// Absolute fallback.
		if runtime.GOOS == "windows" {
			shells = []string{"powershell.exe"}
		} else {
			shells = []string{"/bin/sh"}
		}
	}
	return shells
}


// bestShell detects the best shell binary for the current OS (used when no
// explicit shell is requested).
func bestShell() string {
	available := DetectShells()
	return available[0]
}

// shellArgs returns extra arguments for well-known shells.
func shellArgs(shell string) []string {
	switch shell {
	case "powershell.exe":
		return []string{"-NoLogo", "-NoProfile"}
	case "pwsh.exe":
		return []string{"-NoLogo", "-NoProfile"}
	default:
		// Git Bash / MSYS2 / Cygwin bash need --login so that .bash_profile runs
		// and the PATH is set up correctly.
		if strings.HasSuffix(shell, `\bash.exe`) || strings.HasSuffix(shell, `/bash`) {
			return []string{"--login", "-i"}
		}
		return nil
	}
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
		shell = bestShell()
	}
	args := shellArgs(shell)
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
