const easymidi = require('easymidi');

console.log('Available MIDI inputs:', easymidi.getInputs());
console.log('Available MIDI outputs:', easymidi.getOutputs());

try {
    const input = new easymidi.Input('DJControl Starlight');
    console.log('✓ MIDI Input opened');

    input.on('message', (msg) => {
        console.log('MIDI message:', JSON.stringify(msg));
    });

    console.log('Listening for MIDI messages... Press Ctrl+C to exit');
} catch (err) {
    console.error('Error:', err.message);
}