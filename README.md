# capstone

An Electron application with React

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

```
capstone
├─ .editorconfig
├─ .prettierignore
├─ .prettierrc.yaml
├─ build
│  ├─ entitlements.mac.plist
│  ├─ icon.icns
│  ├─ icon.ico
│  └─ icon.png
├─ electron-builder.yml
├─ electron.vite.config.mjs
├─ eslint.config.mjs
├─ package-lock.json
├─ package.json
├─ README.md
├─ resources
│  └─ icon.png
└─ src
   ├─ main
   │  └─ index.js
   ├─ preload
   │  └─ index.js
   └─ renderer
      ├─ index.html
      └─ src
         ├─ App.jsx
         ├─ assets
         │  ├─ base.css
         │  ├─ electron.svg
         │  ├─ main.css
         │  └─ wavy-lines.svg
         ├─ components
         │  └─ Versions.jsx
         └─ main.jsx

```