/**
 * Měření počtu MIDI pulsů na 1 otočení jog wheel
 *
 * Tento skript měří, kolik MIDI událostí generuje encoder při jednom
 * úplném otočení (360°) jog wheel.
 *
 * POUŽITÍ:
 * 1. Spusť: node measure-pulses-per-rotation.js
 * 2. Najdi si fyzickou značku na jog wheel (např. LED, logo, šev)
 * 3. Po startu měření otoč kolečkem PŘESNĚ 1× dokola (360°)
 * 4. Stiskni Enter pro ukončení měření
 * 5. Opakuj 3× pro přesnost
 */

const midi = require('@julusian/midi');
const readline = require('readline');

class PulsesPerRotationMeter {
    constructor() {
        this.input = null;
        this.events = [];
        this.isRecording = false;
        this.measurements = [];
    }

    findController() {
        const input = new midi.Input();
        const portCount = input.getPortCount();

        console.log("\n🎛️  Dostupné MIDI vstupy:");
        const inputs = [];
        for (let i = 0; i < portCount; i++) {
            const name = input.getPortName(i);
            inputs.push({ index: i, name: name });
            console.log(`  ${i + 1}. ${name}`);
        }

        input.closePort();

        if (inputs.length === 0) {
            throw new Error("❌ Žádný MIDI vstup nenalezen!");
        }

        const starlight = inputs.find(port =>
            port.name.toLowerCase().includes('starlight') ||
            port.name.toLowerCase().includes('dj controller')
        );

        if (starlight) {
            console.log(`\n✅ Nalezen: ${starlight.name}`);
            return starlight.index;
        } else {
            console.log(`\n⚠️  DJ Controller Starlight nenalezen, použiji: ${inputs[0].name}`);
            return inputs[0].index;
        }
    }

    handleMIDIEvent(deltaTime, message) {
        // @julusian/midi používá raw MIDI messages
        // CC message: [0xB0 + channel, controller, value]
        if (message.length === 3) {
            const status = message[0];
            const controller = message[1];
            const value = message[2];

            // Control Change (0xB0-0xBF) a jog wheel (CC 9 nebo 10)
            if ((status & 0xF0) === 0xB0 && (controller === 9 || controller === 10)) {
                if (this.isRecording) {
                    this.events.push({
                        timestamp: Date.now(),
                        controller: controller,
                        value: value,
                        direction: value === 1 ? 'CW' : 'CCW'  // Clockwise / Counter-clockwise
                    });

                    // Live feedback (každých 10 eventů)
                    if (this.events.length % 10 === 0) {
                        process.stdout.write(`\r   📊 Zaznamenáno: ${this.events.length} pulsů...`);
                    }
                }
            }
        }
    }

    async startMeasurement(measurementNumber) {
        this.isRecording = false;
        this.events = [];

        console.log(`\n${"=".repeat(60)}`);
        console.log(`MĚŘENÍ ${measurementNumber} / 3`);
        console.log("=".repeat(60));
        console.log("\n📍 Najdi si vizuální značku na jog wheel (LED, logo, šev...)");
        console.log("📍 Připrav prst na začáteční pozici");
        console.log("\n⏳ Za 3 sekundy začne měření...\n");

        await this.sleep(3000);

        console.log("🟢 ZAČNI OTÁČET! (přesně 1 otáčka = 360°)\n");
        this.isRecording = true;

        // Čekej na Enter
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question('\n👉 Po dokončení 1 otáčky stiskni ENTER...', () => {
                this.isRecording = false;
                rl.close();
                resolve();
            });
        });
    }

    analyzeMeasurement(measurementNumber) {
        const totalPulses = this.events.length;

        if (totalPulses === 0) {
            console.log("\n⚠️  Žádné události nezaznamenány!");
            return null;
        }

        // Spočítej směry
        const cwCount = this.events.filter(e => e.direction === 'CW').length;
        const ccwCount = this.events.filter(e => e.direction === 'CCW').length;
        const netDirection = cwCount > ccwCount ? 'CW' : 'CCW';
        const dominantCount = Math.max(cwCount, ccwCount);

        // Čas měření
        const startTime = this.events[0].timestamp;
        const endTime = this.events[this.events.length - 1].timestamp;
        const duration = (endTime - startTime) / 1000; // sekundy

        console.log(`\n\n✅ Měření ${measurementNumber} dokončeno:`);
        console.log(`   Celkem pulsů:     ${totalPulses}`);
        console.log(`   Směr CW:          ${cwCount} pulsů`);
        console.log(`   Směr CCW:         ${ccwCount} pulsů`);
        console.log(`   Dominantní směr:  ${netDirection} (${dominantCount} pulsů)`);
        console.log(`   Doba otáčení:     ${duration.toFixed(1)} s`);
        console.log(`   Rychlost:         ${(totalPulses / duration).toFixed(1)} pulsů/s`);

        // Varování pokud jsou obě směry významně zastoupené
        if (Math.min(cwCount, ccwCount) > totalPulses * 0.1) {
            console.log(`\n   ⚠️  VAROVÁNÍ: Detekováno ${Math.min(cwCount, ccwCount)} pulsů v opačném směru!`);
            console.log(`       Možná jsi změnil směr během otáčení?`);
        }

        return {
            measurementNumber,
            totalPulses,
            dominantCount,
            direction: netDirection,
            duration,
            cwCount,
            ccwCount,
            eventsPerSecond: totalPulses / duration
        };
    }

    displayFinalResults() {
        console.log("\n\n");
        console.log("╔════════════════════════════════════════════════════════════╗");
        console.log("║              FINÁLNÍ VÝSLEDKY (3 měření)                  ║");
        console.log("╚════════════════════════════════════════════════════════════╝\n");

        if (this.measurements.length === 0) {
            console.log("❌ Žádná platná měření\n");
            return;
        }

        // Tabulka výsledků
        console.log("  Měření    Celkem pulsů    Dominantní    Doba      Rychlost");
        console.log("  " + "-".repeat(60));

        this.measurements.forEach(m => {
            console.log(
                `  ${m.measurementNumber}/3`.padEnd(12) +
                `${m.totalPulses}`.padEnd(16) +
                `${m.dominantCount}`.padEnd(14) +
                `${m.duration.toFixed(1)}s`.padEnd(10) +
                `${m.eventsPerSecond.toFixed(1)} ev/s`
            );
        });

        // Statistiky
        const dominantCounts = this.measurements.map(m => m.dominantCount);
        const avgPulses = dominantCounts.reduce((a, b) => a + b, 0) / dominantCounts.length;
        const minPulses = Math.min(...dominantCounts);
        const maxPulses = Math.max(...dominantCounts);
        const variance = dominantCounts.map(x => Math.pow(x - avgPulses, 2))
                                       .reduce((a, b) => a + b, 0) / dominantCounts.length;
        const stdDev = Math.sqrt(variance);

        console.log("\n📊 STATISTIKA:");
        console.log(`   Průměr:         ${avgPulses.toFixed(1)} pulsů/otáčku`);
        console.log(`   Minimum:        ${minPulses} pulsů`);
        console.log(`   Maximum:        ${maxPulses} pulsů`);
        console.log(`   Směrod. odchylka: ${stdDev.toFixed(1)} pulsů`);
        console.log(`   Konzistence:    ${((1 - stdDev / avgPulses) * 100).toFixed(1)}%`);

        // Doporučení
        const recommendedValue = Math.round(avgPulses);
        console.log(`\n💡 DOPORUČENÁ HODNOTA PRO CONFIG:`);
        console.log(`   encoderPulsesPerRotation: ${recommendedValue}`);

        // Výpočet kroků pro módy
        console.log(`\n📐 VÝPOČET KROKŮ (na 1 MIDI pulse):`);
        console.log(`\n   Mód A - Fixed Step:`);
        console.log(`     Jemné ladění (1 kHz/otáčku):  ${(1000 / recommendedValue).toFixed(2)} Hz/pulse`);
        console.log(`     Hrubé ladění (5 kHz/otáčku):  ${(5000 / recommendedValue).toFixed(2)} Hz/pulse`);

        console.log(`\n   Mód B - Velocity-based:`);
        console.log(`     Pomalé  (1 kHz/otáčku):  ${(1000 / recommendedValue).toFixed(2)} Hz/pulse`);
        console.log(`     Střední (5 kHz/otáčku):  ${(5000 / recommendedValue).toFixed(2)} Hz/pulse`);
        console.log(`     Rychlé  (10 kHz/otáčku): ${(10000 / recommendedValue).toFixed(2)} Hz/pulse`);

        // Varování pokud je velká variabilita
        if (stdDev > avgPulses * 0.1) {
            console.log(`\n   ⚠️  VAROVÁNÍ: Velká variabilita mezi měřeními (${stdDev.toFixed(1)} pulsů)`);
            console.log(`       Možné příčiny:`);
            console.log(`       - Neúplné otočení (nevrátil ses přesně na značku)`);
            console.log(`       - Změna směru během otáčení`);
            console.log(`       - Nedostatečně opatrné měření`);
            console.log(`       Doporučuji opakovat měření!`);
        }

        console.log("\n" + "=".repeat(60));
    }

    saveResults() {
        const report = {
            measurements: this.measurements,
            summary: {
                avgPulsesPerRotation: this.measurements.length > 0 ?
                    this.measurements.map(m => m.dominantCount).reduce((a, b) => a + b, 0) / this.measurements.length : 0,
                recommendedValue: this.measurements.length > 0 ?
                    Math.round(this.measurements.map(m => m.dominantCount).reduce((a, b) => a + b, 0) / this.measurements.length) : 0
            },
            timestamp: new Date().toISOString()
        };

        const fs = require('fs');
        fs.writeFileSync('pulses-per-rotation-report.json', JSON.stringify(report, null, 2), 'utf8');
        console.log(`💾 Detailní report uložen: pulses-per-rotation-report.json`);
    }

    async run() {
        console.log("\n╔════════════════════════════════════════════════════════════╗");
        console.log("║     Měření počtu MIDI pulsů na 1 otočení jog wheel        ║");
        console.log("╚════════════════════════════════════════════════════════════╝");

        // Najdi a připoj controller
        const portIndex = this.findController();
        this.input = new midi.Input();
        this.input.ignoreTypes(true, false, true);
        this.input.openPort(portIndex);

        // Poslouchej MIDI události
        this.input.on('message', (deltaTime, message) => this.handleMIDIEvent(deltaTime, message));

        console.log("\n📋 INSTRUKCE:");
        console.log("   1. Najdi si vizuální značku na jog wheel");
        console.log("   2. Otoč kolečkem PŘESNĚ 1× dokola (360°)");
        console.log("   3. Vrať se na začáteční pozici (značka)");
        console.log("   4. Stiskni Enter");
        console.log("   5. Opakuj 3× pro přesnost\n");

        // Proveď 3 měření
        for (let i = 1; i <= 3; i++) {
            await this.startMeasurement(i);
            const result = this.analyzeMeasurement(i);

            if (result) {
                this.measurements.push(result);
            }

            if (i < 3) {
                console.log("\n⏳ Další měření za 3 sekundy...");
                await this.sleep(3000);
            }
        }

        // Uzavři MIDI
        this.input.closePort();

        // Zobraz finální výsledky
        this.displayFinalResults();

        // Ulož report
        this.saveResults();

        console.log("\n✅ Měření dokončeno!\n");
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Spuštění
if (require.main === module) {
    const meter = new PulsesPerRotationMeter();

    meter.run()
        .then(() => {
            process.exit(0);
        })
        .catch(err => {
            console.error("\n❌ Chyba:", err.message);
            process.exit(1);
        });
}

module.exports = PulsesPerRotationMeter;