package main

import (
	"context"
	"log"
)

// App is the Wails application struct — it owns the SessionManager lifecycle.
type App struct {
	ctx      context.Context
	sessions *SessionManager
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{
		sessions: NewSessionManager(),
	}
}

// startup is called by Wails when the app initialises.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sessions.Start(ctx)
}

// shutdown is called by Wails just before the app exits.
func (a *App) shutdown(ctx context.Context) {
	a.sessions.CloseAll()
}

// DetectShells returns the list of available shell executables on this system.
// Called once by the frontend at startup to populate the shell picker.
func (a *App) DetectShells() []string {
	return DetectShells()
}

// NewSession creates a new PTY-backed shell session and returns its ID.
// shell is the executable to run (e.g. "wsl.exe", "powershell.exe").
// Pass an empty string to auto-detect the best shell.
func (a *App) NewSession(shell string) string {
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
func (a *App) Write(id, data string) error {
	return a.sessions.Write(id, data)
}

// Resize adjusts the PTY dimensions for the given session.
func (a *App) Resize(id string, cols, rows int) error {
	return a.sessions.Resize(id, cols, rows)
}
