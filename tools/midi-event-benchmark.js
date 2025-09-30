/**
 * MIDI Event Frequency Benchmark Tool
 *
 * Měří přesný počet MIDI událostí za sekundu při různých rychlostech otáčení
 * jog wheel na DJ Controller Starlight.
 *
 * Použití:
 * 1. Spusť: node midi-event-benchmark.js
 * 2. Následuj instrukce v konzoli (otoč kolečkem pomalu/středně/rychle)
 * 3. Výsledky se uloží do midi-benchmark-results.json
 */

const midi = require('@julusian/midi');

class MIDIBenchmark {
    constructor() {
        this.input = null;
        this.isRecording = false;
        this.events = [];
        this.startTime = null;
        this.results = {
            slow: null,
            medium: null,
            fast: null,
            metadata: {
                controller: "DJ Controller Starlight",
                jogWheelControllers: [9, 10],
                measurementDuration: 3 // seconds
            }
        };
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

        // Hledáme DJ Controller Starlight
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

    startRecording(label) {
        this.isRecording = true;
        this.events = [];
        this.startTime = Date.now();

        console.log(`\n📊 Zaznamenávám "${label}" (3 sekundy)...`);
        console.log("   Otoč jog wheel (levým nebo pravým)");

        return new Promise((resolve) => {
            setTimeout(() => {
                this.stopRecording(label, resolve);
            }, 3000);
        });
    }

    stopRecording(label, callback) {
        this.isRecording = false;
        const duration = (Date.now() - this.startTime) / 1000;

        // Analyzuj události
        const analysis = this.analyzeEvents(this.events, duration);
        this.results[label] = analysis;

        console.log(`✅ Hotovo! Zaznamenáno ${analysis.totalEvents} událostí`);
        console.log(`   Frekvence: ${analysis.eventsPerSecond.toFixed(1)} events/s`);
        console.log(`   Průměrné ΔT: ${analysis.avgDeltaTime.toFixed(1)} ms`);
        console.log(`   Min ΔT: ${analysis.minDeltaTime.toFixed(1)} ms`);
        console.log(`   Max ΔT: ${analysis.maxDeltaTime.toFixed(1)} ms`);

        callback();
    }

    analyzeEvents(events, duration) {
        if (events.length === 0) {
            return {
                totalEvents: 0,
                eventsPerSecond: 0,
                avgDeltaTime: 0,
                minDeltaTime: 0,
                maxDeltaTime: 0,
                deltaTimeDistribution: {}
            };
        }

        // Spočítej delta times
        const deltaTimes = [];
        for (let i = 1; i < events.length; i++) {
            deltaTimes.push(events[i].timestamp - events[i - 1].timestamp);
        }

        // Distribuce ΔT (buckety po 10ms)
        const distribution = {};
        deltaTimes.forEach(dt => {
            const bucket = Math.floor(dt / 10) * 10;
            distribution[bucket] = (distribution[bucket] || 0) + 1;
        });

        return {
            totalEvents: events.length,
            eventsPerSecond: events.length / duration,
            avgDeltaTime: deltaTimes.reduce((a, b) => a + b, 0) / deltaTimes.length,
            minDeltaTime: Math.min(...deltaTimes),
            maxDeltaTime: Math.max(...deltaTimes),
            deltaTimeDistribution: distribution,
            rawEvents: events.map(e => ({
                timestamp: e.timestamp,
                controller: e.controller,
                value: e.value
            }))
        };
    }

    handleMIDIEvent(deltaTime, message) {
        // @julusian/midi používá raw MIDI messages
        // CC message: [0xB0 + channel, controller, value]

        // DEBUG: Vypiš všechny zprávy během nahrávání
        if (this.isRecording && message.length === 3) {
            const status = message[0];
            const controller = message[1];
            const value = message[2];
            console.log(`   DEBUG: status=0x${status.toString(16)}, cc=${controller}, val=${value}`);
        }

        if (message.length === 3) {
            const status = message[0];
            const controller = message[1];
            const value = message[2];
            const channel = (status & 0x0F) + 1; // Channel 1-16

            // Control Change (0xB0-0xBF) a jog wheel (CC 9 nebo 10)
            if ((status & 0xF0) === 0xB0 && (controller === 9 || controller === 10)) {
                if (this.isRecording) {
                    this.events.push({
                        timestamp: Date.now(),
                        controller: controller,
                        value: value,
                        channel: channel
                    });
                }
            }
        }
    }

    async runBenchmark() {
        console.log("\n╔════════════════════════════════════════════════════════════╗");
        console.log("║       MIDI Event Frequency Benchmark Tool                  ║");
        console.log("║       DJ Controller Starlight - Jog Wheel Analysis         ║");
        console.log("╚════════════════════════════════════════════════════════════╝");

        // Najdi a připoj controller
        const portIndex = this.findController();
        this.input = new midi.Input();

        // Ignoruj sysex, timing a active sensing zprávy (pro lepší výkon)
        this.input.ignoreTypes(true, false, true);

        this.input.openPort(portIndex);

        // Poslouchej MIDI události
        this.input.on('message', (deltaTime, message) => this.handleMIDIEvent(deltaTime, message));

        console.log("\n⏳ Připraveno... Čekám 2 sekundy než začneš...");
        await this.sleep(2000);

        // Test 1: Pomalé otáčení
        console.log("\n" + "=".repeat(60));
        console.log("TEST 1 / 3: POMALÉ OTÁČENÍ");
        console.log("=".repeat(60));
        await this.startRecording('slow');
        await this.sleep(1000);

        // Test 2: Střední rychlost
        console.log("\n" + "=".repeat(60));
        console.log("TEST 2 / 3: STŘEDNÍ RYCHLOST");
        console.log("=".repeat(60));
        await this.startRecording('medium');
        await this.sleep(1000);

        // Test 3: Rychlé otáčení
        console.log("\n" + "=".repeat(60));
        console.log("TEST 3 / 3: RYCHLÉ OTÁČENÍ (maximální rychlost!)");
        console.log("=".repeat(60));
        await this.startRecording('fast');

        // Uzavři MIDI
        this.input.closePort();

        // Zobraz výsledky
        this.displayResults();

        // Ulož do souboru
        this.saveResults();
    }

    displayResults() {
        console.log("\n\n");
        console.log("╔════════════════════════════════════════════════════════════╗");
        console.log("║                    VÝSLEDKY BENCHMARKU                     ║");
        console.log("╚════════════════════════════════════════════════════════════╝");

        const table = [
            ['Rychlost', 'Events/s', 'Avg ΔT', 'Min ΔT', 'Max ΔT', 'Total'],
            ['-'.repeat(12), '-'.repeat(10), '-'.repeat(10), '-'.repeat(10), '-'.repeat(10), '-'.repeat(8)]
        ];

        ['slow', 'medium', 'fast'].forEach(speed => {
            const data = this.results[speed];
            if (data && data.totalEvents > 0) {
                table.push([
                    speed.padEnd(12),
                    data.eventsPerSecond.toFixed(1).padStart(10),
                    `${data.avgDeltaTime.toFixed(1)} ms`.padStart(10),
                    `${data.minDeltaTime.toFixed(1)} ms`.padStart(10),
                    `${data.maxDeltaTime.toFixed(1)} ms`.padStart(10),
                    data.totalEvents.toString().padStart(8)
                ]);
            }
        });

        console.log("\n");
        table.forEach(row => console.log("  " + row.join("  ")));

        // Kalkulace drop rate
        if (this.results.fast && this.results.fast.eventsPerSecond > 0) {
            const targetRate = 5; // FlexRadio capacity
            const dropRate = ((this.results.fast.eventsPerSecond - targetRate) / this.results.fast.eventsPerSecond * 100);

            console.log("\n\n📊 Analýza pro FlexRadio (max 5 req/s):");
            console.log(`   Vstupní frekvence (rychlé): ${this.results.fast.eventsPerSecond.toFixed(1)} events/s`);
            console.log(`   Cílová frekvence: ${targetRate} events/s`);
            console.log(`   Potřebný drop rate: ${dropRate.toFixed(2)}%`);
            console.log(`   Throttle interval: ${(1000 / targetRate).toFixed(0)} ms`);
        }

        console.log("\n");
    }

    saveResults() {
        const fs = require('fs');
        const filename = 'midi-benchmark-results.json';

        fs.writeFileSync(
            filename,
            JSON.stringify(this.results, null, 2),
            'utf8'
        );

        console.log(`💾 Výsledky uloženy do: ${filename}\n`);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Spuštění benchmarku
if (require.main === module) {
    const benchmark = new MIDIBenchmark();

    benchmark.runBenchmark()
        .then(() => {
            console.log("✅ Benchmark dokončen!");
            process.exit(0);
        })
        .catch(err => {
            console.error("❌ Chyba:", err.message);
            process.exit(1);
        });
}

module.exports = MIDIBenchmark;