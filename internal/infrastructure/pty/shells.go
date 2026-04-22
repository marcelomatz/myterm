package pty

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
)

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

// BestShell detects the best shell binary for the current OS (used when no
// explicit shell is requested).
func BestShell() string {
	return DetectShells()[0]
}

// ShellArgs returns extra arguments for well-known shells.
func ShellArgs(shell string) []string {
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
