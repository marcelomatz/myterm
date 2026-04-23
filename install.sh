#!/usr/bin/env bash
set -e

echo -e "\033[1;36mIniciando instalacao do myTerm...\033[0m"

OS="$(uname -s)"

# Busca a ultima release
LATEST_JSON=$(curl -sL "https://api.github.com/repos/marcelomatz/myterm/releases/latest")
TAG=$(echo "$LATEST_JSON" | grep -o '"tag_name": *"[^"]*"' | cut -d'"' -f4 | head -n 1)

if [ -z "$TAG" ]; then
  echo -e "\033[1;31mErro: Nao foi possivel obter a ultima release.\033[0m"
  exit 1
fi

echo -e "\033[1;36mBaixando myTerm $TAG...\033[0m"

if [ "$OS" = "Darwin" ]; then
  # macOS
  DOWNLOAD_URL=$(echo "$LATEST_JSON" | grep -o '"browser_download_url": *"[^"]*macos-universal.zip"' | cut -d'"' -f4 | head -n 1)
  if [ -z "$DOWNLOAD_URL" ]; then
    echo -e "\033[1;31mAsset do macOS não encontrado na release $TAG.\033[0m"
    exit 1
  fi

  TMP_DIR=$(mktemp -d)
  curl -sL -o "$TMP_DIR/myterm.zip" "$DOWNLOAD_URL"
  echo -e "\033[1;36mExtraindo...\033[0m"
  unzip -q "$TMP_DIR/myterm.zip" -d "$TMP_DIR"
  
  # Remove versao anterior se existir
  rm -rf "/Applications/myTerm.app" "/Applications/myterm.app"
  
  mv "$TMP_DIR/myterm.app" "/Applications/myTerm.app"
  rm -rf "$TMP_DIR"
  
  echo -e "\033[1;32mmyTerm instalado com sucesso em /Applications/myTerm.app!\033[0m"

elif [ "$OS" = "Linux" ]; then
  # Linux
  DOWNLOAD_URL=$(echo "$LATEST_JSON" | grep -o '"browser_download_url": *"[^"]*linux-amd64.tar.gz"' | cut -d'"' -f4 | head -n 1)
  if [ -z "$DOWNLOAD_URL" ]; then
    echo -e "\033[1;31mAsset do Linux não encontrado na release $TAG.\033[0m"
    exit 1
  fi

  TMP_DIR=$(mktemp -d)
  curl -sL -o "$TMP_DIR/myterm.tar.gz" "$DOWNLOAD_URL"
  echo -e "\033[1;36mExtraindo...\033[0m"
  tar -xzf "$TMP_DIR/myterm.tar.gz" -C "$TMP_DIR"
  
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
  
  # Remove anterior e copia o novo
  rm -f "$INSTALL_DIR/myterm"
  mv "$TMP_DIR/myterm" "$INSTALL_DIR/"
  chmod +x "$INSTALL_DIR/myterm"
  
  # Criar .desktop para aparecer nos menus
  DESKTOP_DIR="$HOME/.local/share/applications"
  mkdir -p "$DESKTOP_DIR"
  
  cat > "$DESKTOP_DIR/myterm.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=myTerm
Comment=A fast, modern terminal emulator
Exec=$INSTALL_DIR/myterm
Terminal=false
Categories=System;TerminalEmulator;
EOF

  rm -rf "$TMP_DIR"
  echo -e "\033[1;32mmyTerm instalado com sucesso!\033[0m"
  echo -e "\033[1;33mCertifique-se de que $INSTALL_DIR esta no seu PATH.\033[0m"

else
  echo -e "\033[1;31mSistema operacional não suportado: $OS\033[0m"
  exit 1
fi
