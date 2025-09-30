/* FlexRadio message decoder functions.
 * Decodes the payloads that come back from a FlexRadio on
 * both the TCP connection and via VITA-49 over UDP (meter and discovery)
 * payloads.
 *
 * Some references used in building this:
 * http://wiki.flexradio.com/index.php?title=Discovery_protocol
 * https://github.com/kc2g-flex-tools/flexclient
 * https://discourse.nodered.org/t/vita-49-decoding/20792
 * https://github.com/K3TZR/xLib6000/blob/master/Sources/xLib6000/Supporting/Vita.swift
 * https://community.flexradio.com/discussion/7063537/meter-packet-protocol
 * https://github.com/Keichi/binary-parser
 */

const binaryParser = require('binary-parser').Parser;
const flexParser = require('./flex-parser');
const vita49 = require('vita49-js');

const VITA_FLEX_OUI = 0x00001c2d;
const VITA_FLEX_INFORMATION_CLASS = 0x534c;

const StreamType = {
	meter: 0x00000700,
	discovery: 0x00000800
};

const RealtimePacketClass = {
	meter: 0x8002,
	panadapter: 0x8003,
	waterfall: 0x8004,
	opus: 0x8005,
	daxReducedBw: 0x0123,
	daxIq24: 0x02e3,
	daxIq48: 0x02e4,
	daxIq96: 0x02e5,
	daxIq192: 0x02e6,
	daxAudio: 0x03e3,
	discovery: 0xffff,

	decode: function(code) {
		switch (code) {
			case this.meter: return 'meter';
			case this.panadapter: return 'panadapter';
			case this.waterfall: return 'waterfall';
			case this.opus: return 'opus';
			case this.daxReducedBw: return 'daxReducedBw';
			case this.daxIq24: return 'daxIq24';
			case this.daxIq48: return 'daxIq48';
			case this.daxIq96: return 'daxIq96';
			case this.daxIq192: return 'daxIq192';
			case this.daxAudio: return 'daxAudio';
			case this.discovery: return 'discovery';
			default: return 'unknown' + code;
		}
	}
};

const ResponseCode = {
	success: 0,
	parameter_number: 0x5000002C,
	unknown_command: 0x50000015,
	unknown_1: 0x50001000,

	decode: function(code) {
		switch (code) {
			case 0x00000000: return 'success';
			case 0x5000002C: return 'incorrect number of parameters';
			case 0x50001000: return '';
			case 0x50000015: return 'unknown command';
			default: return 'unknown ' + code;
		}
	}
};

function to_hex(num) {
	return '0x' + num.toString(16).padStart(8, '0');
}

// decode() -- decode data sent from a FlexRadio on the TCP control stream.
function decode(response) {
	if (response) {
		try {
			// use PEGJS parser to parse response payloads.
			return flexParser.parse(response);
		} catch (error) {
			console.error('flexradio-js command stream decoding error:');
			console.error(error);
		}
	}

	return null;
}

// decode_discovery() -- decode FlexRadio discovery datagrams sent as UDP broadcast messages
function decode_discovery(dgram) {
	if (dgram.stream === StreamType.discovery) {
		const discovery_payload = new TextDecoder().decode(dgram.payload);
		const clean_payload = discovery_payload.replace(/[^\x20-\x7E]/g, '');
		// Append fake status header so we can use the same parser for the data.
		const radio = flexParser.parse(`S0|${clean_payload}`);
		if (radio && radio.payload) {
			return radio.payload;
		}
	}

	return {};
}

// decode_meters() -- decode the meter reporting datagram (just the payload)
function decode_meters(dgram) {
	const meterParser = new binaryParser()
		.uint16('meter')
		.uint16('value');

	const metersParser = new binaryParser()
		.array(null, {
			type: meterParser,
			readUntil: 'eof'
		});

	const meter_values = {};
	if (dgram.stream === StreamType.meter) {
		try {
			const meter_reports = metersParser.parse(dgram.payload);
			for (let m = 0; m < meter_reports.length; m++) {
				const meter_report = meter_reports[m];
				meter_values[meter_report.meter] = meter_report.value;
			};
		} catch (error) {
			console.error('flexradio-js meter decoding error');
			console.error(error);
			return null;
		}
	}

	return meter_values;
}

// This is the <= v2.2 panadapter format. 
function decode_panadapter_v2(dgram) {
	const oldPanadapterDecoder = new binaryParser()
		.uint32('start_bin')
		.uint32('number_of_bins')
		.uint32('bin_size')
		.uint32('frame_index')
		.array("data", {
			type: new binaryParser().uint16(),
			length: 'number_of_bins'
		});

	try {
		return oldPanadapterDecoder.parse(dgram.payload);
	} catch (error) {
		console.error('flexradio-js panadapter decoding error');
		console.error(error);
	}

	return null;
}

// This is the >=2.2 panadapter format
// MUST send "client set enforce_network_mtu=1" for this to work!
function decode_panadapter(dgram) {
	const panadapterDecoder = new binaryParser()
		.uint16('start_bin')
		.uint16('number_of_bins')
		.uint16('bin_size')
		.uint16('total_bins')
		.uint32('frame_index')
		.array("data", {
			type: new binaryParser().uint16(),
			length: 'number_of_bins'
		});

	try {
		return panadapterDecoder.parse(dgram.payload);
	} catch (error) {
		console.error('flexradio-js panadapter decoding error');
		console.error(error);
	}

	return null;
}

// This is the >=2.3 waterfall format
// MUST send "client set enforce_network_mtu=1" for this to work!
function decode_waterfall(dgram) {
	const waterfallDecoder = new binaryParser()
		.uint64('first_bin_frequency', {			// frequency of first bin Hz
			formatter: function(f) {
				return Number(f) / 1.048576E6;
			}
		})
		.uint64('bin_bandwidth', {					// width of a bin Hz
			formatter: function(f) {
				return Number(f) / 1.048576E6;
			}
		})
		.uint32('line_duration')					// duration of line 1-100ms
		.uint16('number_of_bins')					// number of bins in segment
		.uint16('height')							// height of frame in pixels
		.uint32('time_code')						// time stamp/code
		.uint32('auto_black_level')					// level of auto-black
		.uint16('total_bins')						// number of bins in frame
		.uint16('first_bin_index')					// index of 1st bin in segment
		.array("data", {							// bin values
			type: new binaryParser().uint16(),
			length: 'number_of_bins'
		});

		try {
			return waterfallDecoder.parse(dgram.payload);
		} catch (error) {
			console.error('flexradio-js waterfall decoding error');
			console.error(error);
		}

	return null;
}

function decode_opus(dgram) {
	const opusDecoder = new binaryParser()
		.array("data", {
			type: new binaryParser().uint8(),
			readUntil: 'eof'
		});

	try {
		return opusDecoder.parse(dgram.payload);
	} catch (error) {
		console.error('flexradio-js opus decoding error');
		console.error(error);
	}

	return null;
}

function decode_dax(dgram) {
	const daxDecoder = new binaryParser()
		.array('', {
			type: new binaryParser().array('', {
				type: new binaryParser().floatbe(),
				length: 2,
			}),
			readUntil: 'eof'
		});

	try {
		return daxDecoder.parse(dgram.payload);
	} catch (error) {
		console.error('flexradio-js dax decoding error');
		console.error(error);
	}

	return null;
}

// decode_realtime() -- decode data sent from a FlexRadio on the UDP data channel
function decode_realtime(data) {
	function isFlexClass(vita49_dgram) {
		return vita49_dgram.class.oui === VITA_FLEX_OUI &&
			vita49_dgram.class.information_class === VITA_FLEX_INFORMATION_CLASS;
	}

	function isDataStream(vita49_dgram) {
		return vita49_dgram.packet_type == vita49.PacketType.ext_data_stream ||
				vita49_dgram.packet_type == vita49.PacketType.if_data_stream;
	}

	const vita49_dgram = vita49.decode(data);
	if (vita49_dgram) {
		if (isDataStream(vita49_dgram) && isFlexClass(vita49_dgram)) {
			let payload = null;
			switch (vita49_dgram.class.packet_class) {
				case RealtimePacketClass.meter:
					payload = decode_meters(vita49_dgram);
					break;

				case RealtimePacketClass.panadapter:
					payload = decode_panadapter(vita49_dgram);
					break;

				case RealtimePacketClass.waterfall:
					payload = decode_waterfall(vita49_dgram);
					break;

				case RealtimePacketClass.opus:
					payload = decode_opus(vita49_dgram);
					break;

				case RealtimePacketClass.daxAudio:
				case RealtimePacketClass.daxReducedBw:
				case RealtimePacketClass.daxIq24:
				case RealtimePacketClass.daxIq48:
				case RealtimePacketClass.daxIq96:
				case RealtimePacketClass.daxIq192:
					payload = decode_dax(vita49_dgram);
					break;

				case RealtimePacketClass.discovery:
					payload = decode_discovery(vita49_dgram);
					break;

				default:
					payload = vita49_dgram;
					break;
			}

			if (payload) {
				return {
					type: RealtimePacketClass.decode(vita49_dgram.class.packet_class),
					stream: to_hex(vita49_dgram.stream),
					sequence: vita49_dgram.sequence,
					payload: payload
				};
			}
		}
	}

	return null;
}

// encode_request() -- encode a FlexRadio command/request to be sent on the TCP control stream
function encode_request(sequence, request) {
	return 'C' + sequence + '|' + request.toString();
}

module.exports = {
	response_code: ResponseCode.decode,
	decode: decode,
	decode_realtime: decode_realtime,
	decode_discovery: decode_discovery,
	encode_request: encode_request
};
