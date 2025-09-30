// https://pegjs.org/online
// https://peggyjs.org/online.html
{
	function tokenValue(token) {
		if (typeof token === 'string' && token.startsWith('0x')) {
			return token;
		}

       	return isNaN(Number(token)) ? token : Number(token);
    }
    
	function listValue(key, value) {
		function isListKey(key) {
			const list_keys = ['inuse_.*', 'gui_client_.*', '.*_list'];
			for (let i = 0; i < list_keys.length; i++) {
				if (key.match(list_keys[i])) {
					return true;
				}
			}

			return false;
		}

    	if (value === null) {
    		return value;
    	}
		
    	if (value !== undefined) {
        	if (typeof key === 'string' && isListKey(key)) {
        		return value.split(',').map(tokenValue);
            }
            
        	return tokenValue(value);    
        }

		if (typeof key === 'string' && key.match(/,/g)) {
        	return key.split(',').map(tokenValue);
        }

        return key;
    }

	function makeTopic(msg) {
        if (!msg || msg.length <= 1) {
        	return null;
        }
        
	    const topic = [];
  		msg.forEach(function(t) {
        	if (typeof t === 'string' || typeof t === 'number') {
	           	topic.push(t);
	        }
	    });
    	return topic.join('/');
  	}
    
    function makePayload(msg) {
        if (!msg || msg.length == 0) {
        	return '';
        }
        
        if (msg.length == 1) {
        	return msg[0];
		}
            
    	const payload = {};
        msg.forEach(function(e) {
           	if (Array.isArray(e)) {
            	const key = e[0];
                const name = e[1];
                if (e.length == 3) {
                	if (!(key in payload)) {
                    	payload[key] = {};
                    }
                	payload[key][name] = e[2];
                } else {
                	payload[key] = name;
                }
           	}
        });
        return payload || '';
    }
}

Start = Message / Status / Response / Handle / Version

Message 'Message' 
	= 'M' message_id:Hex_String_np '|' message:.* 
	{ return { type: 'message', 
    			message_id: message_id, 
                payload: message.join('') }; }

Status 'Status' 
	= 'S' client:Hex_String_np '|' response:Payload
	{ return { type: 'status', 
    			client: client,
                topic: makeTopic(response),
                payload: makePayload(response) };
    }
    
Response 'Response' 
	= Response_Handle / Response_Success / Response_Error

// Special case for an untagged (0x) handle in a response
// ex: `R12|50000068|Unable to tune a locked slice -- unlock first`
Response_Handle 'Response_Handle'
	= 'R' sequence:Integer '|0|' response:Handle_List
	{ return { type: 'response', 
    			sequence_number: sequence, 
                response_code: 0, 
                payload: response
		};
    }

// Special case to not parse error messages with non-zero response code
// Happens with `C7|stream create ...` request
Response_Error 'Response_Error'
	= 'R' sequence:Integer '|' code:Hex_String_np '|' response:.*
	{ return { type: 'response', 
    			sequence_number: sequence, 
                response_code: code, 
                payload: response.join('')
		};
    }

Response_Success 'Response_Success'
	= 'R' sequence:Integer '|0|' response:Payload?
	{ return { type: 'response', 
    			sequence_number: sequence, 
                response_code: 0, 
                topic: makeTopic(response),
                payload: makePayload(response) 
		};
    }

Handle 'Handle' 
	= 'H' client:Hex_String_np 
	{ return { type: 'handle', 
    			payload: client }; }
    
Version 'Version' 
	= 'V' version:Version_Number 
	{ return { type: 'version', 
    			payload: version }; }

Payload 'Payload' 
	= Profile / Meter / GPS / Info / Version_Info / Space_KV_List
	
Version_Info "version_info" 
	= &"SmartSDR" m:Hash_KV_List
    { return ['version', ...m]; }

Info 'Info'
	= &'model=' m:Comma_KV_List
    { return ['info', ...m]; }

GPS 'GPS' 
	= 'gps' _ m:Hash_KV_List
	{ return ['gps', ...m]; }

Meter 'Meter' 
	= 'meter' _ m:(Meter_List / Space_KV_List)
	{ return ['meter', ...m] ; }

Meter_List 'Meter_List'
	= &([0-9]+ '.') m:Hash_KV_List
	{ return m; }

Profile 'Profile' 
	= 'profile' _ t:String _ m:(m:Profile_List / m:Space_KV_List)
	{ return ['profile', t, ...m] ; }
Profile_List 'Profile_List'
	= 'list=' m:Caret_List
	{ return [[ 'list', m ]]; }


Space_KV_List 'Space_KV_List'
	= head:Space_KV_Member tail:(_ @Space_KV_Member)* _?
	{ return [head, ...tail]; }
Space_KV_Member 'Space_KV_Member'
	= key:Space_KV_Token eq:'='? value:Space_KV_Token?
	{ return eq ? [key, listValue(key, value)] : listValue(key); }
Space_KV_Token 'Space_KV_Token'
	= [^ =\t]+
	{ return tokenValue(text()); }

Comma_KV_List 'Comma_KV_List'
	= head:Comma_KV_Member tail:(Comma_KV_List_Tail)* ','?
	{ return [head].concat(tail); }
Comma_KV_List_Tail 'Comma_KV_List_Tail'
	= ',' m:Comma_KV_Member
	{ return m; }
Comma_KV_Member 'Comma_KV_Member'
	= key:Comma_KV_Token eq:'='? value:Comma_KV_Token?
	{ return eq ? [key, value] : key; }
Comma_KV_Token 'Comma_KV_Token'
	= String_quoted / Comma_KV_Token_unquoted
Comma_KV_Token_unquoted 
	= [^,=]+
	{ return tokenValue(text()); }

Hash_KV_List 'Hash_KV_List'
	= head:Hash_KV_Member tail:('#' @Hash_KV_Member)* '#'?
	{ return [head, ...tail]; }
Hash_KV_Member 'Hash_KV_Member'
	= key:Hash_KV_Key eq:'='? value:Hash_KV_Token?
	{ return eq ? [...key, value] : key; }
Hash_KV_Key 'Hash_KV_Key'
	= key:Hash_KV_Complex_Key / key:Hash_KV_Token
	{ return [key]; }
Hash_KV_Complex_Key 'Hash_KV_Complex_Key'
	= n:Integer '.' key:Hash_KV_Token
	{ return [n, key]; }
Hash_KV_Token 'Hash_KV_Toksn'
	= [^#=\t]+
	{ return tokenValue(text()); }

Handle_List 
	= head:Hex_String tail:(',' @Hex_String)* ','?
	{ return [head, ...tail]; }

Comma_List 
	= head:Comma_Token tail:(',' @Comma_Token)* ','?
	{ return [head, ...tail]; }
Comma_Token 
	= [^,]+
	{ return tokenValue(text()); }

Caret_List 'Caret_List'
	= head:Caret_Token tail:('^' @Caret_Token)* '^'?
	{ return [head, ...tail]; }
Caret_Token 'Caret_Token'
	= [^\^]+
	{ return tokenValue(text()); }

Version_Number 'Version_Number' 
	= major:Integer '.' minor:Integer '.' patch:Integer '.' build: Integer
	{ return { 
    	version: major + '.' + minor + '.' + patch + '.' + build,
    	major: major, 
       	minor: minor, 
       	patch: patch, 
       	build: build
		};
	}

String 'String' 
	= String_quoted / String_unquoted

String_unquoted 'String_unquoted'
	= [^ ,#\t\n\r\f]+ 
	{ return text(); }  
    
String_quoted 'String_quoted'
	= '"' chars:[^"]* '"'
	{ return chars.join(''); }

Hex_String 'Hex_String' 
	= '0x' hex:[0-9a-fA-F]+
	{ return  '0x' + hex.join('').padStart(8, '0'); }

// Hex String with no 0x Prefix
Hex_String_np 'Hex_String_np'
	= [0-9a-fA-F]+
    { return text() === '0' ? '0' : '0x' + text().padStart(8, '0'); }

Integer 'Integer' 
	= [0-9]+ 
	{ return parseInt(text(), 10); }

_ 'whitespace'
  = [ \t\n\r]+