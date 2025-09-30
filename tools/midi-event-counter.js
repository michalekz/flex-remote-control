/**
 * Jednoduchý MIDI event counter - využívá existující FlexDominator infrastrukturu
 *
 * Tento nástroj loguje každou MIDI událost z jog wheel a počítá frekvenci.
 * Spusť FlexDominator normálně a tento script přidá logging.
 */

const fs = require('fs');

// Patch pro djcontrollerstarlight.js - přidá event counting
const originalHandleCode = fs.readFileSync('src/hardware/djcontrollerstarlight.js', 'utf8');

console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log("║         MIDI Event Frequency Counter (Patch Mode)         ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log("\nNávod:");
console.log("1. Tento script upraví djcontrollerstarlight.js (vytvoří backup)");
console.log("2. Spusť FlexDominator: npm start");
console.log("3. Otoč jog wheel pomalu/středně/rychle");
console.log("4. Sleduj console - uvidíš počet events/s");
console.log("5. Po dokončení spusť: node midi-event-counter-restore.js");
console.log("\nPokračovat? (Ctrl+C pro zrušení, Enter pro pokračování)");

// Vytvoř backup
if (!fs.existsSync('src/hardware/djcontrollerstarlight.js.backup')) {
    fs.copyFileSync(
        'src/hardware/djcontrollerstarlight.js',
        'src/hardware/djcontrollerstarlight.js.backup'
    );
    console.log("✅ Backup vytvořen: djcontrollerstarlight.js.backup");
}

// Přidej event counting do handle() metody
const patchedCode = originalHandleCode.replace(
    'handle(msg)\n    {',
    `handle(msg)
    {
        // ===== EVENT COUNTING PATCH - START =====
        if (!global._midiEventCounter) {
            global._midiEventCounter = {
                slow: [],
                medium: [],
                fast: [],
                all: [],
                startTime: Date.now(),
                lastReport: Date.now()
            };
        }

        // Track jog wheel events (CC 9 or 10)
        if (msg._type === 'cc' && (msg.controller === 9 || msg.controller === 10)) {
            const now = Date.now();
            global._midiEventCounter.all.push(now);

            // Report každých 5 sekund
            if (now - global._midiEventCounter.lastReport > 5000) {
                const recent = global._midiEventCounter.all.filter(t => now - t < 5000);
                const eventsPerSecond = recent.length / 5;

                // Klasifikuj rychlost
                let speed = "idle";
                if (eventsPerSecond > 200) speed = "FAST";
                else if (eventsPerSecond > 50) speed = "MEDIUM";
                else if (eventsPerSecond > 5) speed = "SLOW";

                if (speed !== "idle") {
                    console.log(\`\\n📊 MIDI Event Rate (last 5s):\`);
                    console.log(\`   Speed: \${speed}\`);
                    console.log(\`   Events/s: \${eventsPerSecond.toFixed(1)}\`);
                    console.log(\`   Total events: \${recent.length}\`);
                    console.log(\`   Avg ΔT: \${(5000 / recent.length).toFixed(1)} ms\`);
                }

                global._midiEventCounter.lastReport = now;
                // Vyčisti staré události (> 10s)
                global._midiEventCounter.all = global._midiEventCounter.all.filter(t => now - t < 10000);
            }
        }
        // ===== EVENT COUNTING PATCH - END =====
`
);

fs.writeFileSync('src/hardware/djcontrollerstarlight.js', patchedCode, 'utf8');

console.log("✅ Patch aplikován na djcontrollerstarlight.js");
console.log("\n🚀 Nyní spusť FlexDominator:");
console.log("   npm start");
console.log("\n✋ Po dokončení měření obnov původní soubor:");
console.log("   node midi-event-counter-restore.js");

// Vytvoř restore script
const restoreScript = `
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
`;

fs.writeFileSync('midi-event-counter-restore.js', restoreScript, 'utf8');
console.log("✅ Restore script vytvořen: midi-event-counter-restore.js");