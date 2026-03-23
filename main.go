package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"

	"myterm/api"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := api.NewApp()

	err := wails.Run(&options.App{
		Title:     "MyTerm",
		Width:     1300,
		Height:    700,
		MinWidth:  400,
		MinHeight: 300,
		Frameless: true,

		// Pure black background matches xterm.js theme.
		BackgroundColour: &options.RGBA{R: 30, G: 30, B: 30, A: 255},

		AssetServer: &assetserver.Options{
			Assets: assets,
		},

		OnStartup:     app.Startup,
		OnShutdown:    app.Shutdown,
		OnBeforeClose: app.ConfirmClose,

		Bind: []interface{}{
			app,
		},

		// Platform-specific tweaks.
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    true,
			DisablePinchZoom:     true,
			IsZoomControlEnabled: false,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
		},
		Linux: &linux.Options{
			ProgramName: "myterm",
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
