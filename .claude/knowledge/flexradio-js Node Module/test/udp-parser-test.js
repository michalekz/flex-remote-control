// UDP Client that will send faux FlexRadio data to listeners
const pcap = require('pcap');
const flex = require('..');

const capture_file = process.argv[2];

function udp_packet(packet) {
	if (packet &&
		packet.payload.constructor.name == 'EthernetPacket' &&
		packet.payload.payload &&
		packet.payload.payload.constructor.name == 'IPv4' &&
		packet.payload.payload.payload &&
		packet.payload.payload.payload.constructor.name == 'UDP') {
		return packet.payload.payload.payload;
	}

	return null;
}

const pcap_session = pcap.createOfflineSession(capture_file);
pcap_session.on('packet', function(raw_packet) {
	const packet = pcap.decode.packet(raw_packet);
	if (packet) {
		const u_packet = udp_packet(packet);
		if (u_packet) {
			const data = new Uint8Array(u_packet.data);
			console.log(u_packet);

			const flex_dgram = flex.decode_realtime(data);
			if (flex_dgram) {
				console.log(flex_dgram);
			}

			console.log();
		}
	}
});
