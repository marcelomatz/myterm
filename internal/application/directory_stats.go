package application

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// DirectoryStats holds metrics about a specific directory.
type DirectoryStats struct {
	Path       string `json:"path"`
	TotalFiles int    `json:"totalFiles"`
	TotalDirs  int    `json:"totalDirs"`
	TotalBytes int64  `json:"totalBytes"`
}

// FileNode represents a file or directory for the File Explorer
type FileNode struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

// AnalyzeDirectory performs a shallow read (1 level) of the given directory
// to calculate file count, sizes, and top extensions.
func (s *SessionManager) AnalyzeDirectory(targetPath string) (*DirectoryStats, error) {
	entries, err := os.ReadDir(targetPath)
	if err != nil {
		return nil, err
	}

	stats := &DirectoryStats{
		Path: targetPath,
	}

	for _, entry := range entries {
		if entry.IsDir() {
			stats.TotalDirs++
			continue
		}

		stats.TotalFiles++

		info, err := entry.Info()
		if err == nil {
			stats.TotalBytes += info.Size()
		}
	}

	return stats, nil
}

// ListDirectory reads a given directory path and returns its contents (files and folders).
func (sm *SessionManager) ListDirectory(path string) ([]FileNode, error) {
	if path == "~" || strings.HasPrefix(path, "~/") || strings.HasPrefix(path, "~\\") {
		homeDir, err := os.UserHomeDir()
		if err == nil {
			path = filepath.Join(homeDir, path[1:])
		}
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, fmt.Errorf("ListDirectory failed: %w", err)
	}

	var nodes []FileNode
	for _, entry := range entries {
		nodes = append(nodes, FileNode{
			Name:  entry.Name(),
			Path:  filepath.Join(path, entry.Name()),
			IsDir: entry.IsDir(),
		})
	}

	return nodes, nil
}
