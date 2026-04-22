/**
 * CommandTracker — rastreia comandos executados no terminal e seus exit codes.
 * Adaptado do byCode para o myterm.
 */

// ── Regex patterns ─────────────────────────────────────────────────────────

const OSC_CMD_END = /\x1b\]133;D(?:;(\d+))?\x07/
const OSC_PROMPT_START = /\x1b\]133;A\x07/
const PROMPT_REGEX = /(?:^|\r|\n)(?:\S+[\s@#$%❯>]+\s*)$/
// eslint-disable-next-line no-control-regex
const ANSI_STRIP = /\x1b(?:\]\d+;[^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g
const ERROR_REGEX = /\b(Error|Exception|panic|ERR!|Traceback|fatal error|SyntaxError|TypeError|ReferenceError)\b|command not found/i

export interface CommandRecord {
  command: string
  exitCode: number
  output: string
}

type OnCommandFn = (record: CommandRecord) => void

export class CommandTracker {
  private sessionId: string
  private activeCommand = ''
  private outputBuffer = ''
  private hasOsc133 = false
  private errorDebounceTimer: number | null = null
  private onCommand: OnCommandFn

  constructor(sessionId: string, onCommand: OnCommandFn) {
    this.sessionId = sessionId
    this.onCommand = onCommand
  }

  trackInput(data: string): void {
    if (data === '\r' || data === '\n') {
      this.outputBuffer = ''
    } else if (data === '\x7f' || data === '\b') {
      this.activeCommand = this.activeCommand.slice(0, -1)
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.activeCommand += data
    } else if (data.startsWith('\x1b[A') || data.startsWith('\x1b[B')) {
      this.activeCommand = ''
    }
  }

  trackOutput(data: string): void {
    this.outputBuffer += data

    const oscEnd = OSC_CMD_END.exec(data)
    if (oscEnd) {
      this.hasOsc133 = true
      const exitCode = oscEnd[1] !== undefined ? parseInt(oscEnd[1], 10) : 0
      this.emit(exitCode)
      return
    }

    const stripped = data.replace(ANSI_STRIP, '')
    if (ERROR_REGEX.test(stripped)) {
      if (this.errorDebounceTimer) window.clearTimeout(this.errorDebounceTimer)
      this.errorDebounceTimer = window.setTimeout(() => {
        const cmd = this.activeCommand.trim()
        if (cmd.length > 0 && cmd.length <= 2) return;

        const raw = this.outputBuffer.replace(ANSI_STRIP, '').trim()
        const output = raw.length > 4096 ? raw.slice(-4096) : raw
        window.dispatchEvent(new CustomEvent('myterm:terminal-error', {
          detail: { sessionId: this.sessionId, command: cmd || 'Running Process', output }
        }))
      }, 1200)
    }

    if (OSC_PROMPT_START.test(data)) {
      this.hasOsc133 = true
      this.emit(0)
      return
    }

    if (!this.hasOsc133) {
      const strippedData = data.replace(ANSI_STRIP, '')
      if (PROMPT_REGEX.test(strippedData) && this.outputBuffer.length > 2) {
        this.emit(0)
      }
    }
  }

  static shellIntegrationSetup(shell: string): string {
    const sh = shell.toLowerCase()

    if (sh.includes('fish')) {
      return [
        'function myterm_preexec --on-event fish_preexec',
        '  printf "\\e]133;C\\a"',
        'end',
        'function myterm_precmd --on-event fish_prompt',
        '  printf "\\e]133;D;$status\\a"',
        '  printf "\\e]133;A\\a"',
        'end',
      ].join('; ') + '\r'
    }

    if (sh.includes('zsh')) {
      return [
        'preexec() { printf "\\e]133;C\\a"; }',
        'precmd() { printf "\\e]133;D;$?\\a"; printf "\\e]133;A\\a"; }',
      ].join('; ') + '\r'
    }

    if (sh.includes('pwsh') || sh.includes('powershell')) {
      return [
        'function prompt {',
        '  $exit = $LASTEXITCODE',
        '  $host.UI.RawUI.WindowTitle = (Get-Location).Path',
        '  Write-Host -NoNewline "`e]133;D;$exit`a"',
        '  Write-Host -NoNewline "`e]133;A`a"',
        '  "PS $($executionContext.SessionState.Path.CurrentLocation)$(\'>\'*($nestedPromptLevel+1)) "',
        '}',
      ].join('; ') + '\r'
    }

    return [
      'myterm_preexec() { printf "\\e]133;C\\a"; }',
      'myterm_precmd() { local x=$?; printf "\\e]133;D;${x}\\a"; printf "\\e]133;A\\a"; }',
      'trap \'myterm_preexec\' DEBUG',
      'PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND; }myterm_precmd"',
    ].join('; ') + '\r'
  }

  private emit(exitCode: number): void {
    if (this.errorDebounceTimer) window.clearTimeout(this.errorDebounceTimer)
    
    const cmd = this.activeCommand.trim()
    const raw = this.outputBuffer.replace(ANSI_STRIP, '').trim()
    const output = raw.length > 4096 ? raw.slice(-4096) : raw

    this.activeCommand = ''
    this.outputBuffer = ''

    if (!cmd) return

    this.onCommand({ command: cmd, exitCode, output })
  }
}

export function createCommandTracker(sessionId: string): CommandTracker {
  return new CommandTracker(sessionId, ({ command, exitCode, output }) => {
    if (exitCode > 0) {
      if (command.length > 0 && command.length <= 2) return;

      window.dispatchEvent(new CustomEvent('myterm:terminal-error', { 
        detail: { sessionId, command, output } 
      }))
    }
  })
}
