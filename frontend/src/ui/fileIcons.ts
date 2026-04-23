let MIT: any = null;

export async function initIcons() {
  if (MIT) return;
  try {
    const res = await fetch('/material-icons/material-icons.json');
    MIT = await res.json();
  } catch (err) {
    console.warn("Failed to load material-icons.json", err);
    MIT = {};
  }
}

export interface IconDef {
  icon: string;
}

// Fallback mappings for extensions that material-icon-theme maps purely via languageIds
const fallbackExtensionMap: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  html: 'html',
  htm: 'html',
  txt: 'document',
};

export function getFileIcon(filename: string): IconDef {
  if (!MIT || !MIT.fileNames) return { icon: 'file' };

  // Normalize filename to lowercase
  const name = filename.toLowerCase();
  
  // Helper to resolve the actual svg name minus .svg
  const resolve = (iconName: string): IconDef => {
    // @ts-ignore
    const def = MIT.iconDefinitions?.[iconName];
    if (def && def.iconPath) {
      const parts = def.iconPath.split('/');
      const basename = parts[parts.length - 1];
      return { icon: basename.replace(/\.svg$/, '') };
    }
    return { icon: iconName };
  };

  // 1. Check exact match in fileNames (e.g., package.json, dockerfile)
  if (MIT.fileNames && MIT.fileNames[name]) {
    return resolve(MIT.fileNames[name]);
  }

  // 2. Extract extension(s) backwards (e.g. .d.ts -> d.ts -> ts)
  const parts = name.split('.');
  
  for (let i = parts.length > 2 ? 1 : Math.max(1, parts.length - 1); i < parts.length; i++) {
    const ext = parts.slice(i).join('.');
    if (MIT.fileExtensions && MIT.fileExtensions[ext]) {
      return resolve(MIT.fileExtensions[ext]);
    }
    if (fallbackExtensionMap[ext]) {
      return resolve(fallbackExtensionMap[ext]);
    }
  }

  // 3. Fallback
  return resolve('file');
}

export function getFolderIcon(folderName: string, expanded: boolean = false): IconDef {
  if (!MIT || !MIT.folderNames) return { icon: expanded ? 'folder-open' : 'folder' };

  const name = folderName.toLowerCase();
  
  const resolve = (iconName: string): IconDef => {
    // @ts-ignore
    const def = MIT.iconDefinitions?.[iconName];
    if (def && def.iconPath) {
      const parts = def.iconPath.split('/');
      const basename = parts[parts.length - 1];
      return { icon: basename.replace(/\.svg$/, '') };
    }
    return { icon: iconName };
  };

  // 1. Check folder name overrides
  const map = expanded ? MIT.folderNamesExpanded : MIT.folderNames;
  if (map && map[name]) {
    return resolve(map[name]);
  }

  // 1.5. CleanArchitecture / Hexagonal explicit fallback
  const archMap: Record<string, string> = {
    'adapters': 'folder-plugin',
    'adapter': 'folder-plugin',
    'domain': 'folder-core',
    'entities': 'folder-class',
    'entity': 'folder-class',
    'ports': 'folder-api',
    'port': 'folder-api',
    'use_cases': 'folder-command',
    'usecases': 'folder-command',
    'use-cases': 'folder-command',
    'application': 'folder-app',
    'infrastructure': 'folder-server',
    'infra': 'folder-server',
    'interfaces': 'folder-interface',
    'interface': 'folder-interface',
    'delivery': 'folder-routes',
    'docs': 'folder-docs',
    'doc': 'folder-docs',
    'documentation': 'folder-docs',
  };

  if (archMap[name]) {
    return resolve(archMap[name] + (expanded ? '-open' : ''));
  }

  // 1.8. Prefix matches (e.g. test*, docs*)
  if (name.startsWith('test')) {
    return resolve('folder-test' + (expanded ? '-open' : ''));
  }
  if (name.startsWith('doc') || name.startsWith('docs')) {
    return resolve('folder-docs' + (expanded ? '-open' : ''));
  }

  // 2. Fallbacks
  return resolve(expanded ? 'folder-open' : 'folder');
}
