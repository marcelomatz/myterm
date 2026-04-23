package wails

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"myterm/internal/application"
	"myterm/internal/infrastructure/pty"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// CurrentVersion is injected at build time via:
//
//	-ldflags "-X myterm/internal/adapters/wails.CurrentVersion=vX.Y.Z"
//
// Falls back to "dev" for local/dev builds.
var CurrentVersion = "dev"

const (
	// maxWriteBytes caps the PTY stdin payload to prevent flooding.
	maxWriteBytes = 64 * 1024 // 64 KiB

	// PTY dimension limits — xterm.js clamps visually; we clamp defensively.
	minCols, maxCols = 2, 1024
	minRows, maxRows = 1, 512
)

// UpdateInfo is the result returned to the frontend by CheckForUpdates.
type UpdateInfo struct {
	HasUpdate bool   `json:"hasUpdate"`
	Version   string `json:"version"`
	URL       string `json:"url"`
}

// CheckForUpdates queries the GitHub releases API and compares the latest
// release tag with CurrentVersion. Returns HasUpdate=false on any error so
// the app starts normally even without network access.
func (a *App) CheckForUpdates() UpdateInfo {
	const apiURL = "https://api.github.com/repos/marcelomatz/myterm/releases/latest"

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return UpdateInfo{}
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "myterm-app/"+CurrentVersion)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[updater] network error: %v", err)
		return UpdateInfo{}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[updater] GitHub API returned %d", resp.StatusCode)
		return UpdateInfo{}
	}

	var release struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		log.Printf("[updater] JSON decode error: %v", err)
		return UpdateInfo{}
	}

	latest := strings.TrimPrefix(strings.TrimSpace(release.TagName), "v")
	current := strings.TrimPrefix(strings.TrimSpace(CurrentVersion), "v")

	return UpdateInfo{
		HasUpdate: latest != "" && latest != current && current != "dev",
		Version:   release.TagName,
		URL:       release.HTMLURL,
	}
}

// App is the Wails application struct — it owns the SessionManager lifecycle.
// This is the only struct bound to Wails; it delegates all logic to core.
type App struct {
	ctx       context.Context
	sessions  *application.SessionManager
	forceQuit atomic.Bool // set by ForceQuit() to break the OnBeforeClose loop
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{
		sessions: application.NewSessionManager(),
	}
}

// GetVersion returns the current build version — callable from the frontend.
func (a *App) GetVersion() string {
	return CurrentVersion
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

// ConfirmClose is the OnBeforeClose hook for wails.Run.
// When 2+ sessions are open it emits a frontend event that shows an in-app
// modal and returns true to cancel the OS close. The frontend calls
// ForceQuit() to actually quit after the user confirms.
//
// OnBeforeClose fires AGAIN when runtime.Quit is called (from ForceQuit).
// forceQuit is set atomically before Quit() so the second invocation returns
// false immediately, allowing the app to exit.
func (a *App) ConfirmClose(_ context.Context) (prevent bool) {
	// ForceQuit already set — this is the second call triggered by runtime.Quit.
	if a.forceQuit.Load() {
		return false
	}
	n := a.sessions.Count()
	if n < 2 {
		return false // single session — close without asking
	}
	// Signal the frontend to show the confirmation modal.
	wailsRuntime.EventsEmit(a.ctx, "confirm-close", n)
	return true // prevent OS close; ForceQuit() handles the real quit
}

// ForceQuit terminates the application programmatically.
// Called by the frontend after the user confirms the close modal.
// Sets forceQuit BEFORE calling Quit so the re-entrant OnBeforeClose call
// (which Wails triggers on every Quit) is a no-op.
func (a *App) ForceQuit() {
	a.forceQuit.Store(true)
	wailsRuntime.Quit(a.ctx)
}

// DetectShells returns the list of available shell executables on this system.
// Called once by the frontend at startup to populate the shell picker.
func (a *App) DetectShells() []string {
	return pty.DetectShells()
}

// NewSession creates a new PTY-backed shell session and returns its ID.
// shell must be one of the binaries returned by DetectShells() — any other
// value is rejected to prevent arbitrary binary execution via the RPC bridge.
// Pass an empty string to auto-detect the best shell.
// cwd is the directory the shell should start in.
func (a *App) NewSession(shell string, cwd string) string {
	if shell != "" {
		allowed := pty.DetectShells()
		if !contains(allowed, shell) {
			log.Printf("NewSession rejected unknown shell %q", shell)
			return ""
		}
	}
	id, err := a.sessions.NewSession(shell, cwd)
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

type OllamaTagsResponse struct {
	Models []struct {
		Name string `json:"name"`
	} `json:"models"`
}

// GetOllamaModels fetches the available models from the local Ollama instance.
func (a *App) GetOllamaModels(host string) ([]string, error) {
	url := strings.TrimRight(host, "/") + "/api/tags"
	
	// Create a client with a short timeout to prevent hanging if Ollama is down
	client := &http.Client{Timeout: 2 * 1000 * 1000 * 1000} // 2 seconds
	
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var data OllamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var names []string
	for _, m := range data.Models {
		names = append(names, m.Name)
	}
	return names, nil
}

// GenerateOllamaResponse sends a prompt to Ollama and streams the response via Wails events.
func (a *App) GenerateOllamaResponse(host, model, prompt string) error {
	url := strings.TrimRight(host, "/") + "/api/generate"
	
	payload := map[string]interface{}{
		"model":  model,
		"prompt": prompt,
		"stream": true,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if len(line) > 0 {
			wailsRuntime.EventsEmit(a.ctx, "ollama-chunk", line)
		}
		if err != nil {
			break
		}
	}
	
	wailsRuntime.EventsEmit(a.ctx, "ollama-done")
	return nil
}
