package core

import (
	"context"
	"fmt"
	"sync"

	"github.com/google/uuid"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// SessionManager owns N independent PTY sessions.
// Each session has a unique UUID used as a Wails event namespace.
type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*Terminal
	ctx      context.Context
}

// NewSessionManager creates an empty, uninitialised SessionManager.
func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*Terminal),
	}
}

// Start stores the Wails context so events can be emitted.
func (s *SessionManager) Start(ctx context.Context) {
	s.ctx = ctx
}

// NewSession launches a new shell in a PTY and starts streaming its output.
// shell may be empty to auto-detect the best shell. Returns the session ID.
func (s *SessionManager) NewSession(shell string) (string, error) {
	id := uuid.NewString()

	t := NewTerminal()
	if err := t.StartWithID(s.ctx, id, shell); err != nil {
		return "", fmt.Errorf("NewSession: %w", err)
	}

	s.mu.Lock()
	s.sessions[id] = t
	s.mu.Unlock()

	return id, nil
}

// CloseSession terminates the PTY and removes the session from the map.
func (s *SessionManager) CloseSession(id string) error {
	s.mu.Lock()
	t, ok := s.sessions[id]
	if ok {
		delete(s.sessions, id)
	}
	s.mu.Unlock()

	if !ok {
		return fmt.Errorf("CloseSession: unknown session %q", id)
	}
	t.Close()

	// Signal the frontend that this session has exited cleanly.
	wailsRuntime.EventsEmit(s.ctx, "terminal-exit:"+id, "closed")
	return nil
}

// Write injects raw bytes into the PTY stdin of session id.
func (s *SessionManager) Write(id, data string) error {
	s.mu.RLock()
	t, ok := s.sessions[id]
	s.mu.RUnlock()

	if !ok {
		return fmt.Errorf("Write: unknown session %q", id)
	}
	return t.Write(data)
}

// Resize adjusts the PTY dimensions for session id.
func (s *SessionManager) Resize(id string, cols, rows int) error {
	s.mu.RLock()
	t, ok := s.sessions[id]
	s.mu.RUnlock()

	if !ok {
		return nil // pane may have been closed already
	}
	return t.Resize(cols, rows)
}

// CloseAll terminates every active session (called on app shutdown).
func (s *SessionManager) CloseAll() {
	s.mu.Lock()
	sessions := make(map[string]*Terminal, len(s.sessions))
	for id, t := range s.sessions {
		sessions[id] = t
	}
	s.sessions = make(map[string]*Terminal)
	s.mu.Unlock()

	for _, t := range sessions {
		t.Close()
	}
}

// Count returns the number of currently active sessions.
func (s *SessionManager) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.sessions)
}

