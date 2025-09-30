
const fs = require('fs');

if (fs.existsSync('src/hardware/djcontrollerstarlight.js.backup')) {
    fs.copyFileSync(
        'src/hardware/djcontrollerstarlight.js.backup',
        'src/hardware/djcontrollerstarlight.js'
    );
    fs.unlinkSync('src/hardware/djcontrollerstarlight.js.backup');
    console.log("✅ Původní soubor obnoven");
} else {
    console.log("❌ Backup nenalezen");
}
