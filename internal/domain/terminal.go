package domain

import "context"

// ITerminal defines the contract for a PTY-backed terminal implementation.
type ITerminal interface {
	StartWithID(ctx context.Context, id, shell string) error
	Write(data string) error
	Resize(cols, rows int) error
	Close()
}
