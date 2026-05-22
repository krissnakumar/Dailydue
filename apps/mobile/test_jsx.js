const fs = require('fs');
const babel = require('@babel/core');
try {
  const code = fs.readFileSync('/home/luara/Documents/fiado/faido-mobile/apps/mobile/src/components/NovoClientePopup.tsx', 'utf-8');
  babel.transformSync(code, {
    filename: 'NovoClientePopup.tsx',
    presets: ['@babel/preset-react', '@babel/preset-typescript']
  });
  console.log("BABEL SUCCESS");
} catch (e) {
  console.error("BABEL ERROR:", e.message);
}
