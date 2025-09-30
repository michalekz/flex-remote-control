/**
 * Měření velocity levels (frekvence MIDI událostí) při různých rychlostech otáčení
 *
 * Tento skript měří, kolik MIDI událostí/s generuje jog wheel při:
 * - POMALÉM otáčení
 * - STŘEDNÍM otáčení
 * - RYCHLÉM otáčení (maximální rychlost)
 *
 * Výsledky se použijí pro nastavení velocity anchor points v Módu B.
 *
 * POUŽITÍ:
 * 1. Spusť: node measure-velocity-levels.js
 * 2. Následuj instrukce pro každou rychlost
 * 3. Každé měření trvá 5 sekund
 * 4. Proveď 3 měření pro každou rychlost (celkem 9 měření)
 */

const midi = require('@julusian/midi');

class VelocityLevelsMeter {
    constructor() {
        this.input = null;
        this.events = [];
        this.isRecording = false;
        this.measurements = {
            slow: [],
            medium: [],
            fast: []
        };
        this.measurementDuration = 5000; // 5 sekund
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
                        direction: value === 1 ? 'CW' : 'CCW'
                    });

                    // Live feedback (každých 25 eventů)
                    if (this.events.length % 25 === 0) {
                        const elapsed = (Date.now() - this.startTime) / 1000;
                        const currentRate = this.events.length / elapsed;
                        process.stdout.write(`\r   📊 Events: ${this.events.length}  |  Rate: ${currentRate.toFixed(1)} ev/s  |  Time: ${elapsed.toFixed(1)}s   `);
                    }
                }
            }
        }
    }

    async startMeasurement(speedLabel, measurementNumber) {
        this.isRecording = false;
        this.events = [];
        this.startTime = null;

        const speedEmojis = {
            slow: '🐌',
            medium: '⚡',
            fast: '🚀'
        };

        const speedDescriptions = {
            slow: 'POMALÉ otáčení (jako při jemném ladění na signál)',
            medium: 'STŘEDNÍ rychlost (normální ladění)',
            fast: 'RYCHLÉ otáčení (maximální rychlost, band scanning)'
        };

        console.log(`\n${"=".repeat(60)}`);
        console.log(`${speedEmojis[speedLabel]} ${speedLabel.toUpperCase()} - Měření ${measurementNumber}/3`);
        console.log("=".repeat(60));
        console.log(`\n📋 ${speedDescriptions[speedLabel]}`);
        console.log(`⏱️  Měření bude trvat: ${this.measurementDuration / 1000} sekund`);
        console.log(`\n💡 TIP: Snaž se udržet KONSTANTNÍ rychlost po celou dobu!`);
        console.log(`\n⏳ Za 3 sekundy začne měření...\n`);

        await this.sleep(3000);

        console.log(`🟢 ZAČNI OTÁČET (${speedLabel.toUpperCase()})!\n`);
        this.isRecording = true;
        this.startTime = Date.now();

        // Měření po dobu measurementDuration
        await this.sleep(this.measurementDuration);

        this.isRecording = false;
        console.log(`\n\n🛑 ZASTAV! Měření dokončeno.`);
    }

    analyzeMeasurement(speedLabel, measurementNumber) {
        const totalEvents = this.events.length;

        if (totalEvents === 0) {
            console.log("\n⚠️  Žádné události nezaznamenány!");
            return null;
        }

        // Spočítej delta times mezi po sobě jdoucími eventy
        const deltaTimes = [];
        for (let i = 1; i < this.events.length; i++) {
            deltaTimes.push(this.events[i].timestamp - this.events[i - 1].timestamp);
        }

        const avgDeltaTime = deltaTimes.length > 0 ?
            deltaTimes.reduce((a, b) => a + b, 0) / deltaTimes.length : 0;
        const minDeltaTime = deltaTimes.length > 0 ? Math.min(...deltaTimes) : 0;
        const maxDeltaTime = deltaTimes.length > 0 ? Math.max(...deltaTimes) : 0;

        // Events per second
        const duration = (this.measurementDuration / 1000);
        const eventsPerSecond = totalEvents / duration;

        // Spočítej směry
        const cwCount = this.events.filter(e => e.direction === 'CW').length;
        const ccwCount = this.events.filter(e => e.direction === 'CCW').length;
        const directionChanges = this.countDirectionChanges();

        // Variabilita velocity (směrodatná odchylka delta times)
        const variance = deltaTimes.map(dt => Math.pow(dt - avgDeltaTime, 2))
                                   .reduce((a, b) => a + b, 0) / deltaTimes.length;
        const stdDev = Math.sqrt(variance);
        const consistency = (1 - (stdDev / avgDeltaTime)) * 100;

        console.log(`\n\n✅ Analýza:`);
        console.log(`   Celkem eventů:       ${totalEvents}`);
        console.log(`   Frekvence:           ${eventsPerSecond.toFixed(1)} events/s`);
        console.log(`   Průměrné ΔT:         ${avgDeltaTime.toFixed(2)} ms`);
        console.log(`   Min ΔT:              ${minDeltaTime.toFixed(2)} ms`);
        console.log(`   Max ΔT:              ${maxDeltaTime.toFixed(2)} ms`);
        console.log(`   Konzistence:         ${consistency.toFixed(1)}%`);
        console.log(`   Změny směru:         ${directionChanges}`);

        // Varování pokud je nízká konzistence
        if (consistency < 70) {
            console.log(`\n   ⚠️  VAROVÁNÍ: Nízká konzistence (${consistency.toFixed(1)}%)`);
            console.log(`       Rychlost otáčení nebyla konstantní!`);
            console.log(`       Doporučuji opakovat měření.`);
        }

        // Varování pokud jsou časté změny směru
        if (directionChanges > totalEvents * 0.05) {
            console.log(`\n   ⚠️  VAROVÁNÍ: ${directionChanges} změn směru během otáčení!`);
            console.log(`       Snaž se otáčet plynule v jednom směru.`);
        }

        return {
            speedLabel,
            measurementNumber,
            totalEvents,
            eventsPerSecond,
            avgDeltaTime,
            minDeltaTime,
            maxDeltaTime,
            consistency,
            directionChanges,
            cwCount,
            ccwCount,
            duration
        };
    }

    countDirectionChanges() {
        let changes = 0;
        for (let i = 1; i < this.events.length; i++) {
            if (this.events[i].direction !== this.events[i - 1].direction) {
                changes++;
            }
        }
        return changes;
    }

    displayFinalResults() {
        console.log("\n\n");
        console.log("╔════════════════════════════════════════════════════════════╗");
        console.log("║          FINÁLNÍ VÝSLEDKY - VELOCITY LEVELS               ║");
        console.log("╚════════════════════════════════════════════════════════════╝\n");

        const speeds = ['slow', 'medium', 'fast'];
        const speedLabels = {
            slow: '🐌 POMALÉ',
            medium: '⚡ STŘEDNÍ',
            fast: '🚀 RYCHLÉ'
        };

        speeds.forEach(speed => {
            const measurements = this.measurements[speed];

            if (measurements.length === 0) {
                console.log(`${speedLabels[speed]}: Žádná data\n`);
                return;
            }

            console.log(`${speedLabels[speed]}:`);
            console.log(`  ${"─".repeat(56)}`);
            console.log(`  Měření    Events/s    Avg ΔT    Konzistence    Events`);
            console.log(`  ${"─".repeat(56)}`);

            measurements.forEach(m => {
                console.log(
                    `  ${m.measurementNumber}/3`.padEnd(12) +
                    `${m.eventsPerSecond.toFixed(1)}`.padEnd(12) +
                    `${m.avgDeltaTime.toFixed(1)}ms`.padEnd(10) +
                    `${m.consistency.toFixed(1)}%`.padEnd(15) +
                    `${m.totalEvents}`
                );
            });

            // Průměry
            const avgEventsPerSec = measurements.reduce((sum, m) => sum + m.eventsPerSecond, 0) / measurements.length;
            const avgDeltaTime = measurements.reduce((sum, m) => sum + m.avgDeltaTime, 0) / measurements.length;
            const minEventsPerSec = Math.min(...measurements.map(m => m.eventsPerSecond));
            const maxEventsPerSec = Math.max(...measurements.map(m => m.eventsPerSecond));

            console.log(`  ${"─".repeat(56)}`);
            console.log(`  📊 Průměr:  ${avgEventsPerSec.toFixed(1)} ev/s  |  ΔT: ${avgDeltaTime.toFixed(1)}ms`);
            console.log(`  📊 Rozsah:  ${minEventsPerSec.toFixed(1)} - ${maxEventsPerSec.toFixed(1)} ev/s`);
            console.log();
        });

        // Doporučené anchor points pro Mód B
        console.log("╔════════════════════════════════════════════════════════════╗");
        console.log("║         DOPORUČENÉ ANCHOR POINTS (Mód B)                  ║");
        console.log("╚════════════════════════════════════════════════════════════╝\n");

        if (this.measurements.slow.length > 0 &&
            this.measurements.medium.length > 0 &&
            this.measurements.fast.length > 0) {

            const slowAvg = this.measurements.slow.reduce((sum, m) => sum + m.eventsPerSecond, 0) / this.measurements.slow.length;
            const mediumAvg = this.measurements.medium.reduce((sum, m) => sum + m.eventsPerSecond, 0) / this.measurements.medium.length;
            const fastAvg = this.measurements.fast.reduce((sum, m) => sum + m.eventsPerSecond, 0) / this.measurements.fast.length;

            console.log(`  {`);
            console.log(`    "VelocityTuning": {`);
            console.log(`      "anchorPoints": [`);
            console.log(`        {`);
            console.log(`          "label": "slow",`);
            console.log(`          "velocity": ${Math.round(slowAvg)},     // ev/s (naměřeno: ${slowAvg.toFixed(1)})`);
            console.log(`          "hzPerPulse": 4.07     // 1 kHz na otáčku`);
            console.log(`        },`);
            console.log(`        {`);
            console.log(`          "label": "medium",`);
            console.log(`          "velocity": ${Math.round(mediumAvg)},    // ev/s (naměřeno: ${mediumAvg.toFixed(1)})`);
            console.log(`          "hzPerPulse": 20.33    // 5 kHz na otáčku`);
            console.log(`        },`);
            console.log(`        {`);
            console.log(`          "label": "fast",`);
            console.log(`          "velocity": ${Math.round(fastAvg)},    // ev/s (naměřeno: ${fastAvg.toFixed(1)})`);
            console.log(`          "hzPerPulse": 40.65    // 10 kHz na otáčku`);
            console.log(`        }`);
            console.log(`      ],`);
            console.log(`      "interpolation": "linear",`);
            console.log(`      "smoothingWindow": 5`);
            console.log(`    }`);
            console.log(`  }`);

            // Vizualizace křivky
            console.log(`\n\n📈 VELOCITY KŘIVKA (Hz/pulse):\n`);
            this.drawCurve(slowAvg, mediumAvg, fastAvg);
        }

        console.log("\n" + "=".repeat(60));
    }

    drawCurve(slowVel, mediumVel, fastVel) {
        const maxHz = 40.65;
        const height = 15;
        const width = 60;

        // Vytvoř graf
        const points = [
            { x: 0, y: 4.07, label: `P1 (${Math.round(slowVel)} ev/s)` },
            { x: width / 2, y: 20.33, label: `P2 (${Math.round(mediumVel)} ev/s)` },
            { x: width - 1, y: 40.65, label: `P3 (${Math.round(fastVel)} ev/s)` }
        ];

        console.log(`   Hz/pulse`);
        console.log(`      │`);

        for (let row = height; row >= 0; row--) {
            const hz = (row / height) * maxHz;
            let line = `${hz.toFixed(0).padStart(5)} │`;

            for (let col = 0; col < width; col++) {
                // Lineární interpolace pro křivku
                let expectedHz = 0;
                if (col <= width / 2) {
                    const ratio = col / (width / 2);
                    expectedHz = 4.07 + ratio * (20.33 - 4.07);
                } else {
                    const ratio = (col - width / 2) / (width / 2);
                    expectedHz = 20.33 + ratio * (40.65 - 20.33);
                }

                // Je na této pozici křivka?
                const rowHz = (row / height) * maxHz;
                if (Math.abs(rowHz - expectedHz) < maxHz / height) {
                    // Je to anchor point?
                    const isPoint = points.some(p => Math.abs(p.x - col) < 2 && Math.abs(p.y - rowHz) < 2);
                    line += isPoint ? '●' : '─';
                } else {
                    line += ' ';
                }
            }

            console.log(line);
        }

        console.log(`      └${"─".repeat(width)}→ Velocity (ev/s)`);
        console.log(`       ${Math.round(slowVel)}`.padEnd(20) +
                    `${Math.round(mediumVel)}`.padEnd(20) +
                    `${Math.round(fastVel)}`);
    }

    saveResults() {
        const report = {
            measurements: this.measurements,
            summary: {
                slow: this.calculateSummary('slow'),
                medium: this.calculateSummary('medium'),
                fast: this.calculateSummary('fast')
            },
            timestamp: new Date().toISOString()
        };

        const fs = require('fs');
        fs.writeFileSync('velocity-levels-report.json', JSON.stringify(report, null, 2), 'utf8');
        console.log(`\n💾 Detailní report uložen: velocity-levels-report.json`);
    }

    calculateSummary(speed) {
        const measurements = this.measurements[speed];
        if (measurements.length === 0) return null;

        const avgEventsPerSec = measurements.reduce((sum, m) => sum + m.eventsPerSecond, 0) / measurements.length;
        const avgDeltaTime = measurements.reduce((sum, m) => sum + m.avgDeltaTime, 0) / measurements.length;
        const minEventsPerSec = Math.min(...measurements.map(m => m.eventsPerSecond));
        const maxEventsPerSec = Math.max(...measurements.map(m => m.eventsPerSecond));

        return {
            avgEventsPerSecond: avgEventsPerSec,
            avgDeltaTime: avgDeltaTime,
            minEventsPerSecond: minEventsPerSec,
            maxEventsPerSecond: maxEventsPerSec,
            recommendedVelocity: Math.round(avgEventsPerSec)
        };
    }

    async run() {
        console.log("\n╔════════════════════════════════════════════════════════════╗");
        console.log("║     Měření Velocity Levels - Jog Wheel Speed Analysis     ║");
        console.log("╚════════════════════════════════════════════════════════════╝");

        // Najdi a připoj controller
        const portIndex = this.findController();
        this.input = new midi.Input();
        this.input.ignoreTypes(true, false, true);
        this.input.openPort(portIndex);

        // Poslouchej MIDI události
        this.input.on('message', (deltaTime, message) => this.handleMIDIEvent(deltaTime, message));

        console.log("\n📋 INSTRUKCE:");
        console.log("   • Provedeš 3 měření pro každou rychlost (celkem 9 měření)");
        console.log("   • Každé měření trvá 5 sekund");
        console.log("   • Snaž se udržet KONSTANTNÍ rychlost během měření");
        console.log("   • Otoč plynule v JEDNOM směru (ne tam a zpět!)");
        console.log("\n🎯 RYCHLOSTI:");
        console.log("   🐌 POMALÉ:  Jako při jemném ladění na slabý signál");
        console.log("   ⚡ STŘEDNÍ: Normální rychlost ladění");
        console.log("   🚀 RYCHLÉ:  Maximální rychlost (band scanning)\n");

        await this.sleep(2000);

        // Proveď měření pro každou rychlost
        const speeds = ['slow', 'medium', 'fast'];

        for (const speed of speeds) {
            for (let i = 1; i <= 3; i++) {
                await this.startMeasurement(speed, i);
                const result = this.analyzeMeasurement(speed, i);

                if (result) {
                    this.measurements[speed].push(result);
                }

                if (!(speed === 'fast' && i === 3)) {
                    console.log("\n⏳ Další měření za 3 sekundy...");
                    await this.sleep(3000);
                }
            }
        }

        // Uzavři MIDI
        this.input.closePort();

        // Zobraz finální výsledky
        this.displayFinalResults();

        // Ulož report
        this.saveResults();

        console.log("\n✅ Všechna měření dokončena!\n");
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Spuštění
if (require.main === module) {
    const meter = new VelocityLevelsMeter();

    meter.run()
        .then(() => {
            process.exit(0);
        })
        .catch(err => {
            console.error("\n❌ Chyba:", err.message);
            process.exit(1);
        });
}

module.exports = VelocityLevelsMeter;