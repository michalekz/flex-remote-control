/**
 * MIDI Log Analyzer
 *
 * Analyzuje log z běžící FlexDominator aplikace a měří frekvenci jog wheel eventů.
 *
 * Použití:
 * 1. Spusť FlexDominator: npm start > midi-log.txt
 * 2. Otoč jog wheel různými rychlostmi (každou ~10 sekund)
 * 3. Ukonči FlexDominator (Ctrl+C)
 * 4. Spusť: node analyze-midi-log.js midi-log.txt
 */

const fs = require('fs');
const path = require('path');

class MIDILogAnalyzer {
    constructor(logFile) {
        this.logFile = logFile;
        this.events = [];
    }

    parseLog() {
        const content = fs.readFileSync(this.logFile, 'utf8');
        const lines = content.split('\n');

        console.log(`📂 Načítám: ${this.logFile}`);
        console.log(`📝 Celkem řádků: ${lines.length}`);

        // Regex pro MIDI logy z djcontrollerstarlight.js:
        // [MIDI] cc Ch:1 CC:9 Val:1  (nebo Val:127)
        // [MIDI] cc Ch:2 CC:10 Val:1
        const midiRegex = /\[MIDI\] cc Ch:(\d+) CC:(\d+) Val:(\d+)/;

        let jogWheelCount = 0;
        lines.forEach((line, index) => {
            const match = line.match(midiRegex);
            if (match) {
                const channel = parseInt(match[1]);
                const controller = parseInt(match[2]);
                const value = parseInt(match[3]);

                // Jog wheel = CC 9 nebo 10
                if (controller === 9 || controller === 10) {
                    this.events.push({
                        lineNumber: index + 1,
                        channel,
                        controller,
                        value,
                        line: line.trim()
                    });
                    jogWheelCount++;
                }
            }
        });

        console.log(`🎛️  Nalezeno jog wheel events: ${jogWheelCount}\n`);

        if (jogWheelCount === 0) {
            console.log("⚠️  VAROVÁNÍ: Žádné jog wheel events nenalezeny!");
            console.log("   Zkontroluj:");
            console.log("   1. Je Debug: true v config1.json?");
            console.log("   2. Otáčel jsi kolečkem během běhu aplikace?");
            console.log("   3. Je log správně přesměrován? (npm start > midi-log.txt)\n");
            return false;
        }

        return true;
    }

    analyzeFrequency() {
        if (this.events.length === 0) {
            return;
        }

        // Seskup eventy do 1-sekundových oken
        const windows = {};
        const firstLine = this.events[0].lineNumber;
        const lastLine = this.events[this.events.length - 1].lineNumber;

        // Předpokládáme ~1000 řádků/s (odhadem)
        // Toto je hrubý odhad - ideálně by log měl mít timestamps
        const linesPerSecond = 100; // Konzervativní odhad

        this.events.forEach(event => {
            const secondIndex = Math.floor(event.lineNumber / linesPerSecond);
            if (!windows[secondIndex]) {
                windows[secondIndex] = [];
            }
            windows[secondIndex].push(event);
        });

        console.log("╔════════════════════════════════════════════════════════════╗");
        console.log("║              Frekvence událostí (1s okna)                  ║");
        console.log("╚════════════════════════════════════════════════════════════╝\n");

        const sortedWindows = Object.keys(windows).sort((a, b) => a - b);
        const frequencies = [];

        sortedWindows.forEach(winIndex => {
            const events = windows[winIndex];
            const frequency = events.length;
            frequencies.push(frequency);

            // Klasifikace rychlosti
            let speed = "idle";
            if (frequency > 200) speed = "FAST   🚀";
            else if (frequency > 50) speed = "MEDIUM ⚡";
            else if (frequency > 5) speed = "SLOW   🐌";

            if (frequency > 5) {  // Ignoruj idle
                console.log(`  Okno ${winIndex.toString().padStart(3)}: ${frequency.toString().padStart(4)} events/s  [${speed}]`);
            }
        });

        // Statistiky
        console.log("\n" + "=".repeat(60));
        console.log("📊 CELKOVÁ STATISTIKA\n");

        const activeFrequencies = frequencies.filter(f => f > 5);
        if (activeFrequencies.length > 0) {
            const min = Math.min(...activeFrequencies);
            const max = Math.max(...activeFrequencies);
            const avg = activeFrequencies.reduce((a, b) => a + b, 0) / activeFrequencies.length;

            console.log(`  Minimální frekvence: ${min} events/s`);
            console.log(`  Maximální frekvence: ${max} events/s`);
            console.log(`  Průměrná frekvence:  ${avg.toFixed(1)} events/s`);
            console.log(`  Aktivních oken:      ${activeFrequencies.length}`);

            // Kategorizace
            const slow = activeFrequencies.filter(f => f <= 50).length;
            const medium = activeFrequencies.filter(f => f > 50 && f <= 200).length;
            const fast = activeFrequencies.filter(f => f > 200).length;

            console.log(`\n  Pomalé (≤50 ev/s):   ${slow} oken`);
            console.log(`  Střední (51-200):    ${medium} oken`);
            console.log(`  Rychlé (>200):       ${fast} oken`);

            // Doporučení pro throttling
            console.log(`\n💡 DOPORUČENÍ PRO THROTTLING:`);
            console.log(`  Max zaznamenaná frekvence: ${max} events/s`);
            console.log(`  Cíl (FlexRadio limit):     5 events/s`);
            console.log(`  Drop rate potřebný:        ${((max - 5) / max * 100).toFixed(1)}%`);
            console.log(`  Doporučený throttle:       ${(1000 / 5).toFixed(0)} ms`);
        }

        console.log("\n" + "=".repeat(60));
    }

    generateReport() {
        const report = {
            totalEvents: this.events.length,
            analysisDate: new Date().toISOString(),
            sourceFile: this.logFile,
            events: this.events.map(e => ({
                controller: e.controller,
                value: e.value,
                channel: e.channel,
                lineNumber: e.lineNumber
            }))
        };

        const reportFile = 'midi-analysis-report.json';
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
        console.log(`\n💾 Detailní report uložen: ${reportFile}`);
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log("\n❌ Chybí argument: cesta k log souboru");
        console.log("\nPoužití:");
        console.log("  node analyze-midi-log.js <log-file>");
        console.log("\nPříklad:");
        console.log("  node analyze-midi-log.js midi-log.txt");
        console.log("\nNávod pro získání logu:");
        console.log("  1. Spusť: npm start > midi-log.txt");
        console.log("  2. Otoč jog wheel (pomalé, střední, rychlé otáčení)");
        console.log("  3. Ukonči: Ctrl+C");
        console.log("  4. Analyzuj: node analyze-midi-log.js midi-log.txt\n");
        process.exit(1);
    }

    const logFile = args[0];

    if (!fs.existsSync(logFile)) {
        console.log(`\n❌ Soubor nenalezen: ${logFile}\n`);
        process.exit(1);
    }

    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║              MIDI Log Analyzer for FlexDominator           ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    const analyzer = new MIDILogAnalyzer(logFile);

    if (analyzer.parseLog()) {
        analyzer.analyzeFrequency();
        analyzer.generateReport();
    }

    console.log("\n✅ Analýza dokončena!\n");
}

module.exports = MIDILogAnalyzer;