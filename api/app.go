package api

import (
	"context"
	"fmt"
	"log"
	"myterm/core"
)

const (
	// maxWriteBytes caps the PTY stdin payload to prevent flooding.
	maxWriteBytes = 64 * 1024 // 64 KiB

	// PTY dimension limits — xterm.js clamps visually; we clamp defensively.
	minCols, maxCols = 2, 1024
	minRows, maxRows = 1, 512
)

// App is the Wails application struct — it owns the SessionManager lifecycle.
// This is the only struct bound to Wails; it delegates all logic to core.
type App struct {
	ctx      context.Context
	sessions *core.SessionManager
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{
		sessions: core.NewSessionManager(),
	}
}

// startup is called by Wails when the app initialises.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sessions.Start(ctx)
}

// shutdown is called by Wails just before the app exits.
func (a *App) shutdown(_ context.Context) {
	a.sessions.CloseAll()
}

// Startup exposes the startup hook for wails.Run options binding.
func (a *App) Startup(ctx context.Context) { a.startup(ctx) }

// Shutdown exposes the shutdown hook for wails.Run options binding.
func (a *App) Shutdown(ctx context.Context) { a.shutdown(ctx) }

// DetectShells returns the list of available shell executables on this system.
// Called once by the frontend at startup to populate the shell picker.
func (a *App) DetectShells() []string {
	return core.DetectShells()
}

// NewSession creates a new PTY-backed shell session and returns its ID.
// shell must be one of the binaries returned by DetectShells() — any other
// value is rejected to prevent arbitrary binary execution via the RPC bridge.
// Pass an empty string to auto-detect the best shell.
func (a *App) NewSession(shell string) string {
	if shell != "" {
		allowed := core.DetectShells()
		if !contains(allowed, shell) {
			log.Printf("NewSession rejected unknown shell %q", shell)
			return ""
		}
	}
	id, err := a.sessions.NewSession(shell)
	if err != nil {
		log.Printf("NewSession error: %v", err)
		return ""
	}
	return id
}

// CloseSession terminates the shell and PTY for the given session.
func (a *App) CloseSession(id string) error {
	return a.sessions.CloseSession(id)
}

// Write injects keystrokes into the PTY of the given session.
// Payloads larger than maxWriteBytes are rejected to prevent stdin flooding.
func (a *App) Write(id, data string) error {
	if len(data) > maxWriteBytes {
		return fmt.Errorf("Write: payload too large (%d bytes, limit %d)", len(data), maxWriteBytes)
	}
	return a.sessions.Write(id, data)
}

// Resize adjusts the PTY dimensions for the given session.
// cols and rows are clamped to a safe range to prevent PTY crashes.
func (a *App) Resize(id string, cols, rows int) error {
	if cols < minCols {
		cols = minCols
	} else if cols > maxCols {
		cols = maxCols
	}
	if rows < minRows {
		rows = minRows
	} else if rows > maxRows {
		rows = maxRows
	}
	return a.sessions.Resize(id, cols, rows)
}

// contains reports whether s is present in the slice.
func contains(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}
