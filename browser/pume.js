;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*******************************************************************************
 * Copyright (c) 2013 IBM Corp.
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * and Eclipse Distribution License v1.0 which accompany this distribution. 
 *
 * The Eclipse Public License is available at 
 *    http://www.eclipse.org/legal/epl-v10.html
 * and the Eclipse Distribution License is available at 
 *   http://www.eclipse.org/org/documents/edl-v10.php.
 *
 * Contributors:
 *    Andrew Banks - initial API and implementation and initial documentation
 *******************************************************************************/


// Only expose a single object name in the global namespace.
// Everything must go through this module. Global Messaging module
// only has a single public function, client, which returns
// a Messaging client object given connection details.
 
/**
 * @namespace Messaging 
 * Send and receive messages using web browsers.
 * <p> 
 * This programming interface lets a JavaScript client application use the MQTT V3.1 protocol to 
 * connect to an MQTT-supporting messaging server.
 *  
 * The function supported includes:
 * <ol>
 * <li>Connecting to and disconnecting from a server. The server is identified by its host name and port number. 
 * <li>Specifying options that relate to the communications link with the server, 
 * for example the frequency of keep-alive heartbeats, and whether SSL/TLS is required.
 * <li>Subscribing to and receiving messages from MQTT Topics.
 * <li>Publishing messages to MQTT Topics.
 * </ol>
 * <p>
 * <h2>The API consists of two main objects:</h2>
 * The <b>Messaging.Client</b> object. This contains methods that provide the functionality of the API,
 * including provision of callbacks that notify the application when a message arrives from or is delivered to the messaging server,
 * or when the status of its connection to the messaging server changes.
 * <p>
 * The <b>Messaging.Message</b> object. This encapsulates the payload of the message along with various attributes
 * associated with its delivery, in particular the destination to which it has been (or is about to be) sent. 
 * <p>
 * The programming interface validates parameters passed to it, and will throw an Error containing an error message
 * intended for developer use, if it detects an error with any parameter.
 * <p>
 * Example:
 * 
 * <code><pre>
client = new Messaging.Client(location.hostname, Number(location.port), "clientId");
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;
client.connect({onSuccess:onConnect});

function onConnect() {
  // Once a connection has been made, make a subscription and send a message.
  console.log("onConnect");
  client.subscribe("/World");
  message = new Messaging.Message("Hello");
  message.destinationName = "/World";
  client.send(message); 
};
function onConnectionLost(responseObject) {
  if (responseObject.errorCode !== 0)
    console.log("onConnectionLost:"+responseObject.errorMessage);
};
function onMessageArrived(message) {
  console.log("onMessageArrived:"+message.payloadString);
  client.disconnect(); 
};	
 * </pre></code>
 * <p>
 * Other programming languages,
 * <a href="/clients/java/doc/javadoc/index.html"><big>Java</big></a>,
 * <a href="/clients/c/doc/html/index.html"><big>C</big></a>.
 */
Messaging = (function (global) {

    // Private variables below, these are only visible inside the function closure
    // which is used to define the module. 

	var version = "@VERSION@";
	var buildLevel = "@BUILDLEVEL@";
	
    /** 
     * Unique message type identifiers, with associated
     * associated integer values.
     * @private 
     */
    var MESSAGE_TYPE = {
        CONNECT: 1, 
        CONNACK: 2, 
        PUBLISH: 3,
        PUBACK: 4,
        PUBREC: 5, 
        PUBREL: 6,
        PUBCOMP: 7,
        SUBSCRIBE: 8,
        SUBACK: 9,
        UNSUBSCRIBE: 10,
        UNSUBACK: 11,
        PINGREQ: 12,
        PINGRESP: 13,
        DISCONNECT: 14
    };
    
    // Collection of utility methods used to simplify module code 
    // and promote the DRY pattern.  

    /**
     * Validate an object's parameter names to ensure they 
     * match a list of expected variables name for this option
     * type. Used to ensure option object passed into the API don't
     * contain erroneous parameters.
     * @param {Object} obj User options object
     * @param {key:type, key2:type, ...} valid keys and types that may exist in obj. 
     * @throws {Error} Invalid option parameter found. 
     * @private 
     */
    var validate = function(obj, keys) {
        for(key in obj) {
        	if (obj.hasOwnProperty(key)) {       		
        	    if (keys.hasOwnProperty(key)) {
        	        if (typeof obj[key] !== keys[key])
        		       throw new Error(format(ERROR.INVALID_TYPE, [typeof obj[key], key]));
        	    } else {	
            	    var errorStr = "Unknown property, " + key + ". Valid properties are:";
            	    for (key in keys)
            		    if (keys.hasOwnProperty(key))
            		        errorStr = errorStr+" "+key;
            	    throw new Error(errorStr);
                }
        	}
        }
    };

    /**
     * Return a new function which runs the user function bound
     * to a fixed scope. 
     * @param {function} User function
     * @param {object} Function scope  
     * @return {function} User function bound to another scope
     * @private 
     */
    var scope = function (f, scope) {
        return function () {
            return f.apply(scope, arguments);
        };
    };
    
    /** 
     * Unique message type identifiers, with associated
     * associated integer values.
     * @private 
     */
    var ERROR = {
    	OK: {code:0, text:"AMQJSC0000I OK."},
    	CONNECT_TIMEOUT: {code:1, text:"AMQJSC0001E Connect timed out."},
        SUBSCRIBE_TIMEOUT: {code:2, text:"AMQJS0002E Subscribe timed out."}, 
        UNSUBSCRIBE_TIMEOUT: {code:3, text:"AMQJS0003E Unsubscribe timed out."},
        PING_TIMEOUT: {code:4, text:"AMQJS0004E Ping timed out."},
        INTERNAL_ERROR: {code:5, text:"AMQJS0005E Internal error."},
        CONNACK_RETURNCODE: {code:6, text:"AMQJS0006E Bad Connack return code:{0} {1}."},
        SOCKET_ERROR: {code:7, text:"AMQJS0007E Socket error:{0}."},
        SOCKET_CLOSE: {code:8, text:"AMQJS0008I Socket closed."},
        MALFORMED_UTF: {code:9, text:"AMQJS0009E Malformed UTF data:{0} {1} {2}."},
        UNSUPPORTED: {code:10, text:"AMQJS0010E {0} is not supported by this browser."},
        INVALID_STATE: {code:11, text:"AMQJS0011E Invalid state {0}."},
        INVALID_TYPE: {code:12, text:"AMQJS0012E Invalid type {0} for {1}."},
        INVALID_ARGUMENT: {code:13, text:"AMQJS0013E Invalid argument {0} for {1}."},
        UNSUPPORTED_OPERATION: {code:14, text:"AMQJS0014E Unsupported operation."},
        INVALID_STORED_DATA: {code:15, text:"AMQJS0015E Invalid data in local storage key={0} value={1}."},
        INVALID_MQTT_MESSAGE_TYPE: {code:16, text:"AMQJS0016E Invalid MQTT message type {0}."},
        MALFORMED_UNICODE: {code:17, text:"AMQJS0017E Malformed Unicode string:{0} {1}."},
    };
    
    /** CONNACK RC Meaning. */
    var CONNACK_RC = {
   		0:"Connection Accepted",
   		1:"Connection Refused: unacceptable protocol version",
   		2:"Connection Refused: identifier rejected",
   		3:"Connection Refused: server unavailable",
   		4:"Connection Refused: bad user name or password",
   		5:"Connection Refused: not authorized"
    };
 
    /**
     * Format an error message text.
     * @private
     * @param {error} ERROR.KEY value above.
     * @param {substitutions} [array] substituted into the text.
     * @return the text with the substitutions made.
     */
    var format = function(error, substitutions) {
    	var text = error.text;
    	if (substitutions) {
    	  for (var i=0; i<substitutions.length; i++) {
    		field = "{"+i+"}";
    		start = text.indexOf(field);
    		if(start > 0) {
    			var part1 = text.substring(0,start);
    			var part2 = text.substring(start+field.length);
    			text = part1+substitutions[i]+part2;
    		}
    	  }
    	}
    	return text;
    };
    
    //MQTT protocol and version        6    M    Q    I    s    d    p    3
    var MqttProtoIdentifier = [0x00,0x06,0x4d,0x51,0x49,0x73,0x64,0x70,0x03];
    
    /**
     * @ignore
     * Construct an MQTT wire protocol message.
     * @param type MQTT packet type.
     * @param options optional wire message attributes.
     * 
     * Optional properties
     * 
     * messageIdentifier: message ID in the range [0..65535]
     * payloadMessage:	Application Message - PUBLISH only
     * connectStrings:	array of 0 or more Strings to be put into the CONNECT payload
     * topics:			array of strings (SUBSCRIBE, UNSUBSCRIBE)
     * requestQoS:		array of QoS values [0..2]
     *  
     * "Flag" properties 
     * cleanSession:	true if present / false if absent (CONNECT)
     * willMessage:  	true if present / false if absent (CONNECT)
     * isRetained:		true if present / false if absent (CONNECT)
     * userName:		true if present / false if absent (CONNECT)
     * password:		true if present / false if absent (CONNECT)
     * keepAliveInterval:	integer [0..65535]  (CONNECT)
     *
     * @private
     */
    var WireMessage = function (type, options) { 	
        this.type = type;
        for(name in options) {
            if (options.hasOwnProperty(name)) {
                this[name] = options[name];
            }
        }
    };
    
    WireMessage.prototype.encode = function() {
    	// Compute the first byte of the fixed header
    	var first = ((this.type & 0x0f) << 4);
    	
    	/*
    	 * Now calculate the length of the variable header + payload by adding up the lengths
    	 * of all the component parts
    	 */

    	remLength = 0;
    	topicStrLength = new Array();
    	
    	// if the message contains a messageIdentifier then we need two bytes for that
    	if (this.messageIdentifier != undefined)
    		remLength += 2;

    	switch(this.type) {
    	    // If this a Connect then we need to include 12 bytes for its header
	        case MESSAGE_TYPE.CONNECT:
	        	remLength += MqttProtoIdentifier.length + 3;
                remLength += UTF8Length(this.clientId) + 2;
			    if (this.willMessage != undefined) {
			    	remLength += UTF8Length(this.willMessage.destinationName) + 2;
                    // Will message is always a string, sent as UTF-8 characters with a preceding length.
				    var willMessagePayloadBytes = this.willMessage.payloadBytes;
				    if (!(willMessagePayloadBytes instanceof Uint8Array))
		        		willMessagePayloadBytes = new Uint8Array(payloadBytes);
                    remLength += willMessagePayloadBytes.byteLength +2;
    	        }
                if (this.userName != undefined)
                    remLength += UTF8Length(this.userName) + 2;
                if (this.password != undefined)
                    remLength += UTF8Length(this.password) + 2;
			break;

			// Subscribe, Unsubscribe can both contain topic strings
	        case MESSAGE_TYPE.SUBSCRIBE:	        	
	        	first |= 0x02; // Qos = 1;
	        	for ( var i = 0; i < this.topics.length; i++) {
	        		topicStrLength[i] = UTF8Length(this.topics[i]);
	        		remLength += topicStrLength[i] + 2;
	        	}
	        	remLength += this.requestedQos.length; // 1 byte for each topic's Qos
	        	// QoS on Subscribe only
	        	break;

	        case MESSAGE_TYPE.UNSUBSCRIBE:
	        	first |= 0x02; // Qos = 1;
	        	for ( var i = 0; i < this.topics.length; i++) {
	        		topicStrLength[i] = UTF8Length(this.topics[i]);
	        		remLength += topicStrLength[i] + 2;
	        	}
	        	break;

	        case MESSAGE_TYPE.PUBLISH:
	        	if (this.payloadMessage.duplicate) first |= 0x08;
	        	first  = first |= (this.payloadMessage.qos << 1);
	        	if (this.payloadMessage.retained) first |= 0x01;
	        	destinationNameLength = UTF8Length(this.payloadMessage.destinationName);
	        	remLength += destinationNameLength + 2;	   
	        	var payloadBytes = this.payloadMessage.payloadBytes;
	        	remLength += payloadBytes.byteLength;  
	        	if (payloadBytes instanceof ArrayBuffer)
	        		payloadBytes = new Uint8Array(payloadBytes);
	        	else if (!(payloadBytes instanceof Uint8Array))
	        		payloadBytes = new Uint8Array(payloadBytes.buffer);
	        	break;

	        case MESSAGE_TYPE.DISCONNECT:
	        	break;

	        default:
	        	;
    	}

    	// Now we can allocate a buffer for the message

    	var mbi = encodeMBI(remLength);  // Convert the length to MQTT MBI format
    	var pos = mbi.length + 1;        // Offset of start of variable header
    	var buffer = new ArrayBuffer(remLength + pos);
    	var byteStream = new Uint8Array(buffer);    // view it as a sequence of bytes

    	//Write the fixed header into the buffer
    	byteStream[0] = first;
    	byteStream.set(mbi,1);

    	// If this is a PUBLISH then the variable header starts with a topic
    	if (this.type == MESSAGE_TYPE.PUBLISH)
    		pos = writeString(this.payloadMessage.destinationName, destinationNameLength, byteStream, pos);
    	// If this is a CONNECT then the variable header contains the protocol name/version, flags and keepalive time
    	
    	else if (this.type == MESSAGE_TYPE.CONNECT) {
    		byteStream.set(MqttProtoIdentifier, pos);
    		pos += MqttProtoIdentifier.length;
    		var connectFlags = 0;
    		if (this.cleanSession) 
    			connectFlags = 0x02;
    		if (this.willMessage != undefined ) {
    			connectFlags |= 0x04;
    			connectFlags |= (this.willMessage.qos<<3);
    			if (this.willMessage.retained) {
    				connectFlags |= 0x20;
    			}
    		}
    		if (this.userName != undefined)
    			connectFlags |= 0x80;
            if (this.password != undefined)
    		    connectFlags |= 0x40;
    		byteStream[pos++] = connectFlags; 
    		pos = writeUint16 (this.keepAliveInterval, byteStream, pos);
    	}

    	// Output the messageIdentifier - if there is one
    	if (this.messageIdentifier != undefined)
    		pos = writeUint16 (this.messageIdentifier, byteStream, pos);

    	switch(this.type) {
    	    case MESSAGE_TYPE.CONNECT:
    		    pos = writeString(this.clientId, UTF8Length(this.clientId), byteStream, pos); 
    		    if (this.willMessage != undefined) {
    		        pos = writeString(this.willMessage.destinationName, UTF8Length(this.willMessage.destinationName), byteStream, pos);
    		        pos = writeUint16(willMessagePayloadBytes.byteLength, byteStream, pos);
    		        byteStream.set(willMessagePayloadBytes, pos);
		        	pos += willMessagePayloadBytes.byteLength;
    		        
    	        }
    		if (this.userName != undefined) 
    			pos = writeString(this.userName, UTF8Length(this.userName), byteStream, pos);
    		if (this.password != undefined) 
    			pos = writeString(this.password, UTF8Length(this.password), byteStream, pos);
    		break;

    	    case MESSAGE_TYPE.PUBLISH:	
    	    	// PUBLISH has a text or binary payload, if text do not add a 2 byte length field, just the UTF characters.	
    	    	byteStream.set(payloadBytes, pos);
    	    		
    	    	break;

//    	    case MESSAGE_TYPE.PUBREC:	
//    	    case MESSAGE_TYPE.PUBREL:	
//    	    case MESSAGE_TYPE.PUBCOMP:	
//    	    	break;

    	    case MESSAGE_TYPE.SUBSCRIBE:
    	    	// SUBSCRIBE has a list of topic strings and request QoS
    	    	for (var i=0; i<this.topics.length; i++) {
    	    		pos = writeString(this.topics[i], topicStrLength[i], byteStream, pos);
    	    		byteStream[pos++] = this.requestedQos[i];
    	    	}
    	    	break;

    	    case MESSAGE_TYPE.UNSUBSCRIBE:	
    	    	// UNSUBSCRIBE has a list of topic strings
    	    	for (var i=0; i<this.topics.length; i++)
    	    		pos = writeString(this.topics[i], topicStrLength[i], byteStream, pos);
    	    	break;

    	    default:
    	    	// Do nothing.
    	}

    	return buffer;
    }	

    function decodeMessage(input) {
    	//var msg = new Object();  // message to be constructed
    	var first = input[0];
    	var type = first >> 4;
    	var messageInfo = first &= 0x0f;
    	var pos = 1;
    	

    	// Decode the remaining length (MBI format)

    	var digit;
    	var remLength = 0;
    	var multiplier = 1;
    	do {
    		digit = input[pos++];
    		remLength += ((digit & 0x7F) * multiplier);
    		multiplier *= 128;
    	} while ((digit & 0x80) != 0);

    	var wireMessage = new WireMessage(type);
    	switch(type) {
            case MESSAGE_TYPE.CONNACK:
    	    	wireMessage.topicNameCompressionResponse = input[pos++];
    	        wireMessage.returnCode = input[pos++];
    		    break;
    	    
    	    case MESSAGE_TYPE.PUBLISH:     	    	
    	    	var qos = (messageInfo >> 1) & 0x03;
    	    	   		    
    	    	var len = readUint16(input, pos);
    		    pos += 2;
    		    var topicName = parseUTF8(input, pos, len);
    		    pos += len;
    		    // If QoS 1 or 2 there will be a messageIdentifier
                if (qos > 0) {
    		        wireMessage.messageIdentifier = readUint16(input, pos);
    		        pos += 2;
                }
                
                var message = new Messaging.Message(input.subarray(pos));
                if ((messageInfo & 0x01) == 0x01) 
    	    		message.retained = true;
    	    	if ((messageInfo & 0x08) == 0x08)
    	    		message.duplicate =  true;
                message.qos = qos;
                message.destinationName = topicName;
                wireMessage.payloadMessage = message;	
    		    break;
    	    
    	    case  MESSAGE_TYPE.PUBACK:
    	    case  MESSAGE_TYPE.PUBREC:	    
    	    case  MESSAGE_TYPE.PUBREL:    
    	    case  MESSAGE_TYPE.PUBCOMP:
    	    case  MESSAGE_TYPE.UNSUBACK:    	    	
    	    	wireMessage.messageIdentifier = readUint16(input, pos);
        		break;
    		    
    	    case  MESSAGE_TYPE.SUBACK:
    	    	wireMessage.messageIdentifier = readUint16(input, pos);
        		pos += 2;
    	        wireMessage.grantedQos = input.subarray(pos);	
    		    break;
    	
    	    default:
    	    	;
    	}
    	    	
    	return wireMessage;	
    }

    function writeUint16(input, buffer, offset) {
    	buffer[offset++] = input >> 8;      //MSB
    	buffer[offset++] = input % 256;     //LSB 
    	return offset;
    }	

    function writeString(input, utf8Length, buffer, offset) {
    	offset = writeUint16(utf8Length, buffer, offset);
    	stringToUTF8(input, buffer, offset);
    	return offset + utf8Length;
    }	

    function readUint16(buffer, offset) {
    	return 256*buffer[offset] + buffer[offset+1];
    }	

    /**
     * Encodes an MQTT Multi-Byte Integer
     * @private 
     */
    function encodeMBI(number) {
    	var output = new Array(1);
    	var numBytes = 0;

    	do {
    		var digit = number % 128;
    		number = number >> 7;
    		if (number > 0) {
    			digit |= 0x80;
    		}
    		output[numBytes++] = digit;
    	} while ( (number > 0) && (numBytes<4) );

    	return output;
    }

    /**
     * Takes a String and calculates its length in bytes when encoded in UTF8.
     * @private
     */
    function UTF8Length(input) {
    	var output = 0;
    	for (var i = 0; i<input.length; i++) 
    	{
    		var charCode = input.charCodeAt(i);
                if (charCode > 0x7FF)
                   {
                      // Surrogate pair means its a 4 byte character
                      if (0xD800 <= charCode && charCode <= 0xDBFF)
                        {
                          i++;
                          output++;
                        }
    		       output +=3;
                   }
    		else if (charCode > 0x7F)
    			output +=2;
    		else
    			output++;
    	} 
    	return output;
    }
    
    /**
     * Takes a String and writes it into an array as UTF8 encoded bytes.
     * @private
     */
    function stringToUTF8(input, output, start) {
    	var pos = start;
    	for (var i = 0; i<input.length; i++) {
    		var charCode = input.charCodeAt(i);
    		
    		// Check for a surrogate pair.
    		if (0xD800 <= charCode && charCode <= 0xDBFF) {
    	        lowCharCode = input.charCodeAt(++i);
    	        if (isNaN(lowCharCode)) {
    	        	throw new Error(format(ERROR.MALFORMED_UNICODE, [charCode, lowCharCode]));
    	        }
    	        charCode = ((charCode - 0xD800)<<10) + (lowCharCode - 0xDC00) + 0x10000;
    	    
    	    }
    		
    		if (charCode <= 0x7F) {
    			output[pos++] = charCode;
    		} else if (charCode <= 0x7FF) {
    			output[pos++] = charCode>>6  & 0x1F | 0xC0;
    			output[pos++] = charCode     & 0x3F | 0x80;
    		} else if (charCode <= 0xFFFF) {    				    
    	        output[pos++] = charCode>>12 & 0x0F | 0xE0;
        		output[pos++] = charCode>>6  & 0x3F | 0x80;   
        		output[pos++] = charCode     & 0x3F | 0x80;   
    		} else {
    			output[pos++] = charCode>>18 & 0x07 | 0xF0;
        		output[pos++] = charCode>>12 & 0x3F | 0x80;
        		output[pos++] = charCode>>6  & 0x3F | 0x80;
        		output[pos++] = charCode     & 0x3F | 0x80;
    		};
    	} 
    	return output;
    }
    
    function parseUTF8(input, offset, length) {
    	var output = "";
    	var utf16;
    	var pos = offset;

    	while (pos < offset+length)
    	{
    		var byte1 = input[pos++];
    		if (byte1 < 128)
    			utf16 = byte1;
    		else 
    		{
    			var byte2 = input[pos++]-128;
    			if (byte2 < 0) 
    				throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16),""]));
    			if (byte1 < 0xE0)             // 2 byte character
    				utf16 = 64*(byte1-0xC0) + byte2;
    			else 
    			{ 
    				var byte3 = input[pos++]-128;
    				if (byte3 < 0) 
    					throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16)]));
    				if (byte1 < 0xF0)        // 3 byte character
    					utf16 = 4096*(byte1-0xE0) + 64*byte2 + byte3;
                                else
                                {
                                   var byte4 = input[pos++]-128;
                                   if (byte4 < 0) 
    					throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16), byte4.toString(16)]));
                                   if (byte1 < 0xF8)        // 4 byte character 
                                           utf16 = 262144*(byte1-0xF0) + 4096*byte2 + 64*byte3 + byte4;
    				   else                     // longer encodings are not supported  
    					throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16), byte4.toString(16)]));
                                }
    			}
    		}  

                if (utf16 > 0xFFFF)   // 4 byte character - express as a surrogate pair
                  {
                     utf16 -= 0x10000;
                     output += String.fromCharCode(0xD800 + (utf16 >> 10)); // lead character
                     utf16 = 0xDC00 + (utf16 & 0x3FF);  // trail character
                  }
    		output += String.fromCharCode(utf16);
    	}
    	return output;
    }
    
    /** @ignore Repeat keepalive requests, monitor responses.*/
    var Pinger = function(client, window, keepAliveInterval) { 
    	this._client = client;        	
     	this._window = window;
     	this._keepAliveInterval = keepAliveInterval*1000;     	
        this.isReset = false;
        
        var pingReq = new WireMessage(MESSAGE_TYPE.PINGREQ).encode(); 
        
        var doTimeout = function (pinger) {
	        return function () {
	            return doPing.apply(pinger);
	        };
	    };
	    
	    /** @ignore */
        var doPing = function() { 
        	if (!this.isReset) {
        		this._client._trace("Pinger.doPing", "Timed out");
        		this._client._disconnected( ERROR.PING_TIMEOUT.code , format(ERROR.PING_TIMEOUT));
        	} else {
        	    this.isReset = false;
        	    this._client._trace("Pinger.doPing", "send PINGREQ");
                this._client.socket.send(pingReq); 
        	    this.timeout = this._window.setTimeout(doTimeout(this), this._keepAliveInterval);
            }
        }

        this.reset = function() {
        	this.isReset = true;
        	this._window.clearTimeout(this.timeout);
        	if (this._keepAliveInterval > 0)
        		this.timeout = setTimeout(doTimeout(this), this._keepAliveInterval);
        }

        this.cancel = function() {
        	this._window.clearTimeout(this.timeout);
        }
     }; 

	/** @ignore Monitor request completion. */
	var Timeout = function(client, window, timeoutSeconds, action, args) {
		this._window = window;
		if (!timeoutSeconds)
			timeoutSeconds = 30;
		
		var doTimeout = function (action, client, args) {
	        return function () {
	            return action.apply(client, args);
	        };
	    };
        this.timeout = setTimeout(doTimeout(action, client, args), timeoutSeconds * 1000);
        
		this.cancel = function() {
			this._window.clearTimeout(this.timeout);
		}
	}; 
    
    /*
	 * Internal implementation of the Websockets MQTT V3.1 client.
	 * 
	 * @name Messaging.ClientImpl @constructor 
	 * @param {String} host the DNS nameof the webSocket host. 
	 * @param {Number} port the port number for that host.
	 * @param {String} clientId the MQ client identifier.
	 */
    var ClientImpl = function (host, port, clientId) {
    	// Check dependencies are satisfied in this browser.
    	if (!("WebSocket" in global && global["WebSocket"] !== null)) {
            throw new Error(format(ERROR.UNSUPPORTED, ["WebSocket"]));
 	    } 
        if (!("localStorage" in global && global["localStorage"] !== null)) {
         	throw new Error(format(ERROR.UNSUPPORTED, ["localStorage"]));
        }
        if (!("ArrayBuffer" in global && global["ArrayBuffer"] !== null)) {
         	throw new Error(format(ERROR.UNSUPPORTED, ["ArrayBuffer"]));
        }
    	
        this._trace("Messaging.Client", host, port, clientId);

        this.host = host;
        this.port = port;
        this.clientId = clientId;

        // Local storagekeys are qualified with the following string.
        this._localKey=host+":"+port+":"+clientId+":";

        // Create private instance-only message queue
        // Internal queue of messages to be sent, in sending order. 
        this._msg_queue = [];

        // Messages we have sent and are expecting a response for, indexed by their respective message ids. 
        this._sentMessages = {};

        // Messages we have received and acknowleged and are expecting a confirm message for
        // indexed by their respective message ids. 
        this._receivedMessages = {};
 
        // Internal list of callbacks to be executed when messages
        // have been successfully sent over web socket, e.g. disconnect
        // when it doesn't have to wait for ACK, just message is dispatched.
        this._notify_msg_sent = {};

        // Unique identifier for SEND messages, incrementing
        // counter as messages are sent.
        this._message_identifier = 1;
        
        // Used to determine the transmission sequence of stored sent messages.
    	this._sequence = 0;
    	

        // Load the local state, if any, from the saved version, only restore state relevant to this client.   	
        for(key in localStorage)
        	if (   key.indexOf("Sent:"+this._localKey) == 0  		    
        	    || key.indexOf("Received:"+this._localKey) == 0)
        	this.restore(key);
    };

    // Messaging Client public instance members. 
    ClientImpl.prototype.host;
    ClientImpl.prototype.port;
    ClientImpl.prototype.clientId;

    // Messaging Client private instance members.
    ClientImpl.prototype.socket;
    /* true once we have received an acknowledgement to a CONNECT packet. */
    ClientImpl.prototype.connected = false;
    /* The largest message identifier allowed, may not be larger than 2**16 but 
     * if set smaller reduces the maximum number of outbound messages allowed.
     */ 
    ClientImpl.prototype.maxMessageIdentifier = 65536;
    ClientImpl.prototype.connectOptions;
    ClientImpl.prototype.hostIndex;
    ClientImpl.prototype.onConnectionLost;
    ClientImpl.prototype.onMessageDelivered;
    ClientImpl.prototype.onMessageArrived;
    ClientImpl.prototype._msg_queue = null;
    ClientImpl.prototype._connectTimeout;
    /* The sendPinger monitors how long we allow before we send data to prove to the server that we are alive. */
    ClientImpl.prototype.sendPinger = null;
    /* The receivePinger monitors how long we allow before we require evidence that the server is alive. */
    ClientImpl.prototype.receivePinger = null;
    
    ClientImpl.prototype._traceBuffer = null;
    ClientImpl.prototype._MAX_TRACE_ENTRIES = 100;

    ClientImpl.prototype.connect = function (connectOptions) {
    	var connectOptionsMasked = this._traceMask(connectOptions, "password"); 
    	this._trace("Client.connect", connectOptionsMasked, this.socket, this.connected);
        
    	if (this.connected) 
        	throw new Error(format(ERROR.INVALID_STATE, ["already connected"]));
    	if (this.socket)
    		throw new Error(format(ERROR.INVALID_STATE, ["already connected"]));
        
    	this.connectOptions = connectOptions;
    	
    	if (connectOptions.hosts) {
    	    this.hostIndex = 0;
    	    this._doConnect(connectOptions.hosts[0], connectOptions.ports[0]);  
    	} else {
            this._doConnect(this.host, this.port);  		
    	}
        
    };

    ClientImpl.prototype.subscribe = function (filter, subscribeOptions) {
    	this._trace("Client.subscribe", filter, subscribeOptions);
              
    	if (!this.connected)
    	    throw new Error(format(ERROR.INVALID_STATE, ["not connected"]));
    	
        var wireMessage = new WireMessage(MESSAGE_TYPE.SUBSCRIBE);
        wireMessage.topics=[filter];
        if (subscribeOptions.qos != undefined)
        	wireMessage.requestedQos = [subscribeOptions.qos];
        else 
        	wireMessage.requestedQos = [0];
        
        if (subscribeOptions.onSuccess) {
            wireMessage.callback = function() {subscribeOptions.onSuccess({invocationContext:subscribeOptions.invocationContext});};
        }
        if (subscribeOptions.timeout) {
        	wireMessage.timeOut = new Timeout(this, window, subscribeOptions.timeout, subscribeOptions.onFailure
        			, [{invocationContext:subscribeOptions.invocationContext, 
        				errorCode:ERROR.SUBSCRIBE_TIMEOUT.code, 
        				errorMessage:format(ERROR.SUBSCRIBE_TIMEOUT)}]);
        }
        
        // All subscriptions return a SUBACK. 
        this._requires_ack(wireMessage);
        this._schedule_message(wireMessage);
    };

    /** @ignore */
    ClientImpl.prototype.unsubscribe = function(filter, unsubscribeOptions) {  
    	this._trace("Client.unsubscribe", filter, unsubscribeOptions);
        
    	if (!this.connected)
    	   throw new Error(format(ERROR.INVALID_STATE, ["not connected"]));
    	
    	var wireMessage = new WireMessage(MESSAGE_TYPE.UNSUBSCRIBE);
        wireMessage.topics = [filter];
        
        if (unsubscribeOptions.onSuccess) {
        	wireMessage.callback = function() {unsubscribeOptions.onSuccess({invocationContext:unsubscribeOptions.invocationContext});};
        }
        if (unsubscribeOptions.timeout) {
        	wireMessage.timeOut = new Timeout(this, window, unsubscribeOptions.timeout, unsubscribeOptions.onFailure
        			, [{invocationContext:unsubscribeOptions.invocationContext,
        				errorCode:ERROR.UNSUBSCRIBE_TIMEOUT.code,
        				errorMessage:format(ERROR.UNSUBSCRIBE_TIMEOUT)}]);
        }
     
        // All unsubscribes return a SUBACK.         
        this._requires_ack(wireMessage);
        this._schedule_message(wireMessage);
    };
     
    ClientImpl.prototype.send = function (message) {
        this._trace("Client.send", message);

        if (!this.connected)
           throw new Error(format(ERROR.INVALID_STATE, ["not connected"]));
        
        wireMessage = new WireMessage(MESSAGE_TYPE.PUBLISH);
        wireMessage.payloadMessage = message;
        
        if (message.qos > 0)
            this._requires_ack(wireMessage);
        else if (this.onMessageDelivered)
        	this._notify_msg_sent[wireMessage] = this.onMessageDelivered(wireMessage.payloadMessage);
        this._schedule_message(wireMessage);
    };
    
    ClientImpl.prototype.disconnect = function () {
        this._trace("Client.disconnect");

        if (!this.socket)
    		throw new Error(format(ERROR.INVALID_STATE, ["not connecting or connected"]));
        
        wireMessage = new WireMessage(MESSAGE_TYPE.DISCONNECT);

        // Run the disconnected call back as soon as the message has been sent,
        // in case of a failure later on in the disconnect processing.
        // as a consequence, the _disconected call back may be run several times.
        this._notify_msg_sent[wireMessage] = scope(this._disconnected, this);

        this._schedule_message(wireMessage);
    };
    
   ClientImpl.prototype.getTraceLog = function () {
        if ( this._traceBuffer !== null ) {
            this._trace("Client.getTraceLog", new Date());
            this._trace("Client.getTraceLog in flight messages", this._sentMessages.length);
            for (key in this._sentMessages)
                this._trace("_sentMessages ",key, this._sentMessages[key]);
            for (key in this._receivedMessages)
                this._trace("_receivedMessages ",key, this._receivedMessages[key]);

            return this._traceBuffer;
        }
    };

    ClientImpl.prototype.startTrace = function () {
        if ( this._traceBuffer === null ) {
            this._traceBuffer = [];
        }
        this._trace("Client.startTrace", new Date(), version);
    };

    ClientImpl.prototype.stopTrace = function () {
        delete this._traceBuffer;
    };

    ClientImpl.prototype._doConnect = function (host, port) { 	        
        // When the socket is open, this client will send the CONNECT WireMessage using the saved parameters. 
        if (this.connectOptions.useSSL)
          wsurl = ["wss://", host, ":", port, "/mqtt"].join("");
        else
          wsurl = ["ws://", host, ":", port, "/mqtt"].join("");
        this.connected = false;
        this.socket = new WebSocket(wsurl, 'mqttv3.1');
        this.socket.binaryType = 'arraybuffer';
        this.socket.onopen = scope(this._on_socket_open, this);
        this.socket.onmessage = scope(this._on_socket_message, this);
        this.socket.onerror = scope(this._on_socket_error, this);
        this.socket.onclose = scope(this._on_socket_close, this);
        
        this.sendPinger = new Pinger(this, window, this.connectOptions.keepAliveInterval);
        this.receivePinger = new Pinger(this, window, this.connectOptions.keepAliveInterval);
        
        this._connectTimeout = new Timeout(this, window, this.connectOptions.timeout, this._disconnected,  [ERROR.CONNECT_TIMEOUT.code, format(ERROR.CONNECT_TIMEOUT)]);
    };

    
    // Schedule a new message to be sent over the WebSockets
    // connection. CONNECT messages cause WebSocket connection
    // to be started. All other messages are queued internally
    // until this has happened. When WS connection starts, process
    // all outstanding messages. 
    ClientImpl.prototype._schedule_message = function (message) {
        this._msg_queue.push(message);
        // Process outstanding messages in the queue if we have an  open socket, and have received CONNACK. 
        if (this.connected) {
            this._process_queue();
        }
    };

    ClientImpl.prototype.store = function(prefix, wireMessage) {
    	storedMessage = {type:wireMessage.type, messageIdentifier:wireMessage.messageIdentifier, version:1};
    	
    	switch(wireMessage.type) {
	      case MESSAGE_TYPE.PUBLISH:
	    	  if(wireMessage.pubRecReceived)
	    		  storedMessage.pubRecReceived = true;
	    	  
	    	  // Convert the payload to a hex string.
	    	  storedMessage.payloadMessage = {};
	    	  var hex = "";
	          var messageBytes = wireMessage.payloadMessage.payloadBytes;
	          for (var i=0; i<messageBytes.length; i++) {
	            if (messageBytes[i] <= 0xF)
	              hex = hex+"0"+messageBytes[i].toString(16);
	            else 
	              hex = hex+messageBytes[i].toString(16);
	          }
	    	  storedMessage.payloadMessage.payloadHex = hex;
	    	  
	    	  storedMessage.payloadMessage.qos = wireMessage.payloadMessage.qos;
	    	  storedMessage.payloadMessage.destinationName = wireMessage.payloadMessage.destinationName;
	    	  if (wireMessage.payloadMessage.duplicate) 
	    		  storedMessage.payloadMessage.duplicate = true;
	    	  if (wireMessage.payloadMessage.retained) 
	    		  storedMessage.payloadMessage.retained = true;	   
	    	  
	    	  // Add a sequence number to sent messages.
	    	  if ( prefix.indexOf("Sent:") == 0 ) {
	    		  if ( wireMessage.sequence === undefined )
	    		      wireMessage.sequence = ++this._sequence;
	    		  storedMessage.sequence = wireMessage.sequence;
	    	  }
	          break;    
	          
	        default:
	        	throw Error(format(ERROR.INVALID_STORED_DATA, [key, storedMessage]));
  	    }
    	localStorage.setItem(prefix+this._localKey+wireMessage.messageIdentifier, JSON.stringify(storedMessage));
    };
    
    ClientImpl.prototype.restore = function(key) {    	
    	var value = localStorage.getItem(key);
    	var storedMessage = JSON.parse(value);
    	
    	var wireMessage = new WireMessage(storedMessage.type, storedMessage);
    	
    	switch(storedMessage.type) {
	      case MESSAGE_TYPE.PUBLISH:
	    	  // Replace the payload message with a Message object.
	    	  var hex = storedMessage.payloadMessage.payloadHex;
	    	  var buffer = new ArrayBuffer((hex.length)/2);
              var byteStream = new Uint8Array(buffer); 
              var i = 0;
              while (hex.length >= 2) { 
            	  var x = parseInt(hex.substring(0, 2), 16);
	              hex = hex.substring(2, hex.length);
	              byteStream[i++] = x;
	          }
              var payloadMessage = new Messaging.Message(byteStream);
	      	  
	    	  payloadMessage.qos = storedMessage.payloadMessage.qos;
	    	  payloadMessage.destinationName = storedMessage.payloadMessage.destinationName;
              if (storedMessage.payloadMessage.duplicate) 
	    		  payloadMessage.duplicate = true;
	    	  if (storedMessage.payloadMessage.retained) 
	    		  payloadMessage.retained = true;	 
	    	  wireMessage.payloadMessage = payloadMessage;
              
	          break;    
	          
	        default:
	          throw Error(format(ERROR.INVALID_STORED_DATA, [key, value]));
	    }
    	    		    	
    	if (key.indexOf("Sent:"+this._localKey) == 0) {      
    		this._sentMessages[wireMessage.messageIdentifier] = wireMessage;    		    
    	} else if (key.indexOf("Received:"+this._localKey) == 0) {
    		this._receivedMessages[wireMessage.messageIdentifier] = wireMessage;
    	}
    };
    
    ClientImpl.prototype._process_queue = function () {
        var message = null;
        // Process messages in order they were added
        var fifo = this._msg_queue.reverse();

        // Send all queued messages down socket connection
        while ((message = fifo.pop())) {
            this._socket_send(message);
            // Notify listeners that message was successfully sent
            if (this._notify_msg_sent[message]) {
                this._notify_msg_sent[message]();
                delete this._notify_msg_sent[message];
            }
        }
    };

    /**
     * @ignore
     * Expect an ACK response for this message. Add message to the set of in progress
     * messages and set an unused identifier in this message.
     */
    ClientImpl.prototype._requires_ack = function (wireMessage) {
    	var messageCount = Object.keys(this._sentMessages).length;
        if (messageCount > this.maxMessageIdentifier)
            throw Error ("Too many messages:"+messageCount);

        while(this._sentMessages[this._message_identifier] !== undefined) {
            this._message_identifier++;
        }
        wireMessage.messageIdentifier = this._message_identifier;
        this._sentMessages[wireMessage.messageIdentifier] = wireMessage;
        if (wireMessage.type === MESSAGE_TYPE.PUBLISH) {
        	this.store("Sent:", wireMessage);
        }
        if (this._message_identifier === this.maxMessagIdentifier) {
            this._message_identifier = 1;
        }
    };

    /** 
     * @ignore
     * Called when the underlying websocket has been opened.
     */
    ClientImpl.prototype._on_socket_open = function () {        
        // Create the CONNECT message object.
        var wireMessage = new WireMessage(MESSAGE_TYPE.CONNECT, this.connectOptions); 
        wireMessage.clientId = this.clientId;
        this._socket_send(wireMessage);
    };

    /** 
     * @ignore
     * Called when the underlying websocket has received a complete packet.
     */
    ClientImpl.prototype._on_socket_message = function (event) {
        this._trace("Client._on_socket_message", event.data);
        
        // Reset the receive ping timer, we now have evidence the server is alive.
        this.receivePinger.reset();
        var byteArray = new Uint8Array(event.data);
        try {
            var wireMessage = decodeMessage(byteArray);
        } catch (error) {
        	this._disconnected(ERROR.INTERNAL_ERROR.code , format(ERROR.INTERNAL_ERROR, [error.message]));
        	return;
        }
        this._trace("Client._on_socket_message", wireMessage);

        try {
        	switch(wireMessage.type) {
            case MESSAGE_TYPE.CONNACK:
            	this._connectTimeout.cancel();
            	
            	// If we have started using clean session then clear up the local state.
            	if (this.connectOptions.cleanSession) {
    		    	for (key in this._sentMessages) {	    		
    		    	    var sentMessage = this._sentMessages[key];
    					localStorage.removeItem("Sent:"+this._localKey+sentMessage.messageIdentifier);
    		    	}
    				this._sentMessages = {};

    				for (key in this._receivedMessages) {
    					var receivedMessage = this._receivedMessages[key];
    					localStorage.removeItem("Received:"+this._localKey+receivedMessage.messageIdentifier);
    				}
    				this._receivedMessages = {};
            	}
            	// Client connected and ready for business.
            	if (wireMessage.returnCode === 0) {
        	        this.connected = true;
        	        // Jump to the end of the list of hosts and stop looking for a good host.
        	        if (this.connectOptions.hosts)
        	            this.hostIndex = this.connectOptions.hosts.length;
                } else {
                    this._disconnected(ERROR.CONNACK_RETURNCODE.code , format(ERROR.CONNACK_RETURNCODE, [wireMessage.returnCode, CONNACK_RC[wireMessage.returnCode]]));
                    break;
                }
            	
        	    // Resend messages.
            	var sequencedMessages = new Array();
            	for (var msgId in this._sentMessages) {
            	    if (this._sentMessages.hasOwnProperty(msgId))
            	        sequencedMessages.push(this._sentMessages[msgId]);
            	}
          
        	    // Sort sentMessages into the original sent order.
            	var sequencedMessages = sequencedMessages.sort(function(a,b) {return a.sequence - b.sequence;} );
        	    for (var i=0, len=sequencedMessages.length; i<len; i++) {
        	    	var sentMessage = sequencedMessages[i];
        	    	if (sentMessage.type == MESSAGE_TYPE.PUBLISH && sentMessage.pubRecReceived) {
        	    	    var pubRelMessage = new WireMessage(MESSAGE_TYPE.PUBREL, {messageIdentifier:sentMessage.messageIdentifier});
        	            this._schedule_message(pubRelMessage);
        	    	} else {
        	    		this._schedule_message(sentMessage);
        	    	};
        	    }

        	    // Execute the connectOptions.onSuccess callback if there is one.
        	    if (this.connectOptions.onSuccess) {
        	        this.connectOptions.onSuccess({invocationContext:this.connectOptions.invocationContext});
        	    }

        	    // Process all queued messages now that the connection is established. 
        	    this._process_queue();
        	    break;
        
            case MESSAGE_TYPE.PUBLISH:
                this._receivePublish(wireMessage);
                break;

            case MESSAGE_TYPE.PUBACK:
            	var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
                 // If this is a re flow of a PUBACK after we have restarted receivedMessage will not exist.
            	if (sentMessage) {
                    delete this._sentMessages[wireMessage.messageIdentifier];
                    localStorage.removeItem("Sent:"+this._localKey+wireMessage.messageIdentifier);
                    if (this.onMessageDelivered)
                    	this.onMessageDelivered(sentMessage.payloadMessage);
                }
            	break;
            
            case MESSAGE_TYPE.PUBREC:
                var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
                // If this is a re flow of a PUBREC after we have restarted receivedMessage will not exist.
                if (sentMessage) {
                	sentMessage.pubRecReceived = true;
                    var pubRelMessage = new WireMessage(MESSAGE_TYPE.PUBREL, {messageIdentifier:wireMessage.messageIdentifier});
                    this.store("Sent:", sentMessage);
                    this._schedule_message(pubRelMessage);
                }
                break;
            	            	
            case MESSAGE_TYPE.PUBREL:
                var receivedMessage = this._receivedMessages[wireMessage.messageIdentifier];
                localStorage.removeItem("Received:"+this._localKey+wireMessage.messageIdentifier);
                // If this is a re flow of a PUBREL after we have restarted receivedMessage will not exist.
                if (receivedMessage) {
                    this._receiveMessage(receivedMessage);
                    delete this._receivedMessages[wireMessage.messageIdentifier];
                }
                // Always flow PubComp, we may have previously flowed PubComp but the server lost it and restarted.
                pubCompMessage = new WireMessage(MESSAGE_TYPE.PUBCOMP, {messageIdentifier:wireMessage.messageIdentifier});
                this._schedule_message(pubCompMessage);                    
                    
                
                break;

            case MESSAGE_TYPE.PUBCOMP: 
            	var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
            	delete this._sentMessages[wireMessage.messageIdentifier];
                localStorage.removeItem("Sent:"+this._localKey+wireMessage.messageIdentifier);
                if (this.onMessageDelivered)
                	this.onMessageDelivered(sentMessage.payloadMessage);
                break;
                
            case MESSAGE_TYPE.SUBACK:
                var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
                if (sentMessage) {
                	if(sentMessage.timeOut)
                	    sentMessage.timeOut.cancel();
                    if (sentMessage.callback) {
                        sentMessage.callback();
                    }
                    delete this._sentMessages[wireMessage.messageIdentifier];
                }
                break;
        	    
            case MESSAGE_TYPE.UNSUBACK:
            	var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
                if (sentMessage) { 
                	if (sentMessage.timeOut)
                        sentMessage.timeOut.cancel();
                    if (sentMessage.callback) {
                        sentMessage.callback();
                    }
                    delete this._sentMessages[wireMessage.messageIdentifier];
                }

                break;
                
            case MESSAGE_TYPE.PINGRESP:
            	/* The sendPinger or receivePinger may have sent a ping, the receivePinger has already been reset. */
            	this.sendPinger.reset();
            	break;
            	
            case MESSAGE_TYPE.DISCONNECT:
            	// Clients do not expect to receive disconnect packets.
            	this._disconnected(ERROR.INVALID_MQTT_MESSAGE_TYPE.code , format(ERROR.INVALID_MQTT_MESSAGE_TYPE, [wireMessage.type]));
            	break;

            default:
            	this._disconnected(ERROR.INVALID_MQTT_MESSAGE_TYPE.code , format(ERROR.INVALID_MQTT_MESSAGE_TYPE, [wireMessage.type]));
        	};
        } catch (error) {
        	this._disconnected(ERROR.INTERNAL_ERROR.code , format(ERROR.INTERNAL_ERROR, [error.message]));
        	return;
        }
    };
    
    /** @ignore */
    ClientImpl.prototype._on_socket_error = function (error) {
    	this._disconnected(ERROR.SOCKET_ERROR.code , format(ERROR.SOCKET_ERROR, [error.data]));
    };

    /** @ignore */
    ClientImpl.prototype._on_socket_close = function () {
        this._disconnected(ERROR.SOCKET_CLOSE.code , format(ERROR.SOCKET_CLOSE));
    };

    /** @ignore */
    ClientImpl.prototype._socket_send = function (wireMessage) {
    	if (wireMessage.type == 1) {
    		var wireMessageMasked = this._traceMask(wireMessage, "password"); 
    		this._trace("Client._socket_send", wireMessageMasked);
    	}
    	else this._trace("Client._socket_send", wireMessage);
        
        this.socket.send(wireMessage.encode());
        /* We have proved to the server we are alive. */
        this.sendPinger.reset();
    };
    
    /** @ignore */
    ClientImpl.prototype._receivePublish = function (wireMessage) {
        switch(wireMessage.payloadMessage.qos) {
            case "undefined":
            case 0:
                this._receiveMessage(wireMessage);
                break;

            case 1:
                var pubAckMessage = new WireMessage(MESSAGE_TYPE.PUBACK, {messageIdentifier:wireMessage.messageIdentifier});
                this._schedule_message(pubAckMessage);
                this._receiveMessage(wireMessage);
                break;

            case 2:
                this._receivedMessages[wireMessage.messageIdentifier] = wireMessage;
                this.store("Received:", wireMessage);
                var pubRecMessage = new WireMessage(MESSAGE_TYPE.PUBREC, {messageIdentifier:wireMessage.messageIdentifier});
                this._schedule_message(pubRecMessage);

                break;

            default:
                throw Error("Invaild qos="+wireMmessage.payloadMessage.qos);
        };
    };

    /** @ignore */
    ClientImpl.prototype._receiveMessage = function (wireMessage) {
        if (this.onMessageArrived) {
            this.onMessageArrived(wireMessage.payloadMessage);
        }
    };

    /**
     * @ignore
     * Client has disconnected either at its own request or because the server
     * or network disconnected it. Remove all non-durable state.
     * @param {errorCode} [number] the error number.
     * @param {errorText} [string] the error text.
     */
    ClientImpl.prototype._disconnected = function (errorCode, errorText) {
    	this._trace("Client._disconnected", errorCode, errorText);
    	
    	this.sendPinger.cancel();
    	this.receivePinger.cancel();
    	if (this._connectTimeout)
    	    this._connectTimeout.cancel();
    	// Clear message buffers.
        this._msg_queue = [];
        this._notify_msg_sent = {};
       
        if (this.socket) {
            // Cancel all socket callbacks so that they cannot be driven again by this socket.
            this.socket.onopen = null;
            this.socket.onmessage = null;
            this.socket.onerror = null;
            this.socket.onclose = null;
            if (this.socket.readyState === 1)
                this.socket.close();
            delete this.socket;           
        }
        
        if (this.connectOptions.hosts && this.hostIndex < this.connectOptions.hosts.length-1) {
        	// Try the next host.
        	this.hostIndex++;
        	this._doConnect(this.connectOptions.hosts[this.hostIndex], this.connectOptions.ports[this.hostIndex]);
        
        } else {
        
            if (errorCode === undefined) {
        	    errorCode = ERROR.OK.code;
        	    errorText = format(ERROR.OK);
            }
        	
            // Run any application callbacks last as they may attempt to reconnect and hence create a new socket.
            if (this.connected) {
                this.connected = false;
                // Execute the connectionLostCallback if there is one, and we were connected.       
                if (this.onConnectionLost)
            	    this.onConnectionLost({errorCode:errorCode, errorMessage:errorText});      	
            } else {
        	    // Otherwise we never had a connection, so indicate that the connect has failed.
                if(this.connectOptions.onFailure)
            	    this.connectOptions.onFailure({invocationContext:this.connectOptions.invocationContext, errorCode:errorCode, errorMessage:errorText});
            }
        }
    };

    /** @ignore */
    ClientImpl.prototype._trace = function () {
        if ( this._traceBuffer !== null ) {  
            for (var i = 0, max = arguments.length; i < max; i++) {
                if ( this._traceBuffer.length == this._MAX_TRACE_ENTRIES ) {    
                    this._traceBuffer.shift();              
                }
                if (i === 0) this._traceBuffer.push(arguments[i]);
                else if (typeof arguments[i] === "undefined" ) this._traceBuffer.push(arguments[i]);
                else this._traceBuffer.push("  "+JSON.stringify(arguments[i]));
           };
        };
    };
    
    /** @ignore */
    ClientImpl.prototype._traceMask = function (traceObject, masked) {
        var traceObjectMasked = {};
	    for (var attr in traceObject) {
	        if (traceObject.hasOwnProperty(attr)) {
	        	if (attr == masked) 
	        		traceObjectMasked[attr] = "******";
	        	else
	        		traceObjectMasked[attr] = traceObject[attr];
	        } 
	    }
	    return traceObjectMasked;
    };

    // ------------------------------------------------------------------------
    // Public Programming interface.
    // ------------------------------------------------------------------------
    
    /** 
     * The JavaScript application communicates to the server using a Messaging.Client object. 
     * <p>
     * Other programming languages,
     * <a href="/clients/java/doc/javadoc/com/ibm/micro/client/mqttv3/MqttClient.html"><big>Java</big></a>,
     * <a href="/clients/c/doc/html/index.html"><big>C</big></a>.
     * <p>
     * Most applications will create just one Client object and then call its connect() method,
     * however applications can create more than one Client object if they wish. 
     * In this case the combination of host, port and clientId attributes must be different for each Client object.
     * <p>
     * The send, subscribe and unsubscribe methods are implemented as asynchronous JavaScript methods 
     * (even though the underlying protocol exchange might be synchronous in nature). 
     * This means they signal their completion by calling back to the application, 
     * via Success or Failure callback functions provided by the application on the method in question. 
     * Such callbacks are called at most once per method invocation and do not persist beyond the lifetime 
     * of the script that made the invocation.
     * <p>
     * In contrast there are some callback functions <i> most notably onMessageArrived</i> 
     * that are defined on the Messaging.Client object.  
     * These may get called multiple times, and aren't directly related to specific method invocations made by the client. 
     *
     * @name Messaging.Client    
     * 
     * @constructor
     * Creates a Messaging.Client object that can be used to communicate with a Messaging server.
     *  
     * @param {string} host the address of the messaging server, as a DNS name or dotted decimal IP address.
     * @param {number} port the port number in the host to connect to.
     * @param {string} clientId the Messaging client identifier, between 1 and 23 characters in length.
     * 
     * @property {string} host <i>read only</i> the server's DNS hostname or dotted decimal IP address.
     * @property {number} port <i>read only</i> the server's port.
     * @property {string} clientId <i>read only</i> used when connecting to the server.
     * @property {function} onConnectionLost called when a connection has been lost, 
     * after a connect() method has succeeded.
     * Establish the call back used when a connection has been lost. The connection may be
     * lost because the client initiates a disconnect or because the server or network 
     * cause the client to be disconnected. The disconnect call back may be called without 
     * the connectionComplete call back being invoked if, for example the client fails to 
     * connect.
     * A single response object parameter is passed to the onConnectionLost callback containing the following fields:
     * <ol>   
     * <li>errorCode
     * <li>errorMessage       
     * </ol>
     * @property {function} onMessageDelivered called when a message has been delivered. 
     * All processing that this Client will ever do has been completed. So, for example,
     * in the case of a Qos=2 message sent by this client, the PubComp flow has been received from the server
     * and the message has been removed from persistent storage before this callback is invoked. 
     * Parameters passed to the onMessageDelivered callback are:
     * <ol>   
     * <li>Messaging.Message that was delivered.
     * </ol>    
     * @property {function} onMessageArrived called when a message has arrived in this Messaging.client. 
     * Parameters passed to the onMessageArrived callback are:
     * <ol>   
     * <li>Messaging.Message that has arrived.
     * </ol>    
     */
    var Client = function (host, port, clientId) {
    	if (typeof host !== "string")
        	throw new Error(format(ERROR.INVALID_TYPE, [typeof host, "host"]));
    	if (typeof port !== "number" || port < 0)
        	throw new Error(format(ERROR.INVALID_TYPE, [typeof port, "port"]));
    	
    	var clientIdLength = 0;
    	for (var i = 0; i<clientId.length; i++) {
    		var charCode = clientId.charCodeAt(i);                   
    		if (0xD800 <= charCode && charCode <= 0xDBFF)  {    			
                 i++; // Surrogate pair.
            }   		   
    		clientIdLength++;
    	}     	   	
        if (typeof clientId !== "string" || clientIdLength < 1 | clientIdLength > 23)
        	throw new Error(format(ERROR.INVALID_ARGUMENT, [clientId, "clientId"])); 
    	
        var client = new ClientImpl(host, port, clientId);
        this._getHost =  function() { return client.host; };
    	this._setHost = function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); };
         	
        this._getPort = function() { return client.port; };
    	this._setPort = function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); };
    	
    	this._getClientId = function() { return client.clientId; };
    	this._setClientId = function() { throw new Error(format(ERROR.UNSUPPORTED_OPERATION)); };
        
        this._getOnConnectionLost = function() { return client.onConnectionLost; };
        this._setOnConnectionLost = function(newOnConnectionLost) { 
            if (typeof newOnConnectionLost === "function")
            	client.onConnectionLost = newOnConnectionLost;
            else 
    			throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnConnectionLost, "onConnectionLost"]));
        };

        this._getOnMessageDelivered = function() { return client.onMessageDelivered; };
    	this._setOnMessageDelivered = function(newOnMessageDelivered) { 
    		if (typeof newOnMessageDelivered === "function")
    			client.onMessageDelivered = newOnMessageDelivered;
    		else 
    			throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnMessageDelivered, "onMessageDelivered"]));
    	};
       
        this._getOnMessageArrived = function() { return client.onMessageArrived; };
    	this._setOnMessageArrived = function(newOnMessageArrived) { 
    		if (typeof newOnMessageArrived === "function")
    			client.onMessageArrived = newOnMessageArrived;
    		else 
    			throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnMessageArrived, "onMessageArrived"]));
    	};
        
        /** 
         * Connect this Messaging client to its server. 
         * 
         * @name Messaging.Client#connect
         * @function
         * @param {Object} [connectOptions] attributes used with the connection. 
         * <p>
         * Properties of the connect options are: 
         * @config {number} [timeout] If the connect has not succeeded within this number of seconds, it is deemed to have failed.
         *                            The default is 30 seconds.
         * @config {string} [userName] Authentication username for this connection.
         * @config {string} [password] Authentication password for this connection.
         * @config {Messaging.Message} [willMessage] sent by the server when the client disconnects abnormally.
         * @config {Number} [keepAliveInterval] the server disconnects this client if there is no activity for this
         *                number of seconds. The default value of 60 seconds is assumed if not set.
         * @config {boolean} [cleanSession] if true(default) the client and server persistent state is deleted on successful connect.
         * @config {boolean} [useSSL] if present and true, use an SSL Websocket connection.
         * @config {object} [invocationContext] passed to the onSuccess callback or onFailure callback.
         * @config {function} [onSuccess] called when the connect acknowledgement has been received from the server.
         * A single response object parameter is passed to the onSuccess callback containing the following fields:
         * <ol>
         * <li>invocationContext as passed in to the onSuccess method in the connectOptions.       
         * </ol>
         * @config {function} [onFailure] called when the connect request has failed or timed out.
         * A single response object parameter is passed to the onFailure callback containing the following fields:
         * <ol>
         * <li>invocationContext as passed in to the onFailure method in the connectOptions.       
         * <li>errorCode a number indicating the nature of the error.
         * <li>errorMessage text describing the error.      
         * </ol>
         * @config {Array} [hosts] If present this set of hostnames is tried in order in place 
         * of the host and port paramater on the construtor. The hosts and the matching ports are tried one at at time in order until
         * one of then succeeds.
         * @config {Array} [ports] If present this set of ports matching the hosts.
         * @throws {InvalidState} if the client is not in disconnected state. The client must have received connectionLost
         * or disconnected before calling connect for a second or subsequent time.
         */
        this.connect = function (connectOptions) {
        	connectOptions = connectOptions || {} ;
        	validate(connectOptions,  {timeout:"number",
        			                   userName:"string", 
        		                       password:"string", 
        		                       willMessage:"object", 
        		                       keepAliveInterval:"number", 
        		                       cleanSession:"boolean", 
        		                       useSSL:"boolean",
        		                       invocationContext:"object", 
      		                           onSuccess:"function", 
      		                           onFailure:"function",
      		                           hosts:"object",
      		                           ports:"object"});
        	
        	// If no keep alive interval is set, assume 60 seconds.
            if (connectOptions.keepAliveInterval === undefined)
            	connectOptions.keepAliveInterval = 60;

        	if (connectOptions.willMessage) {
                if (!(connectOptions.willMessage instanceof Message))
            	    throw new Error(format(ERROR.INVALID_TYPE, [connectOptions.willMessage, "connectOptions.willMessage"]));
                // The will message must have a payload that can be represented as a string.
                // Cause the willMessage to throw an exception if this is not the case.
            	connectOptions.willMessage.stringPayload;
            	
            	if (typeof connectOptions.willMessage.destinationName === "undefined")
                	throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.willMessage.destinationName, "connectOptions.willMessage.destinationName"]));
        	}
        	if (typeof connectOptions.cleanSession === "undefined")
        		connectOptions.cleanSession = true;
        	if (connectOptions.hosts) {
        		if (!connectOptions.ports)
        			throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"]));
        		if (!(connectOptions.hosts instanceof Array) )
        			throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts, "connectOptions.hosts"]));
        		if (!(connectOptions.ports instanceof Array) )
        			throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"]));
        		if (connectOptions.hosts.length <1 )
        			throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts, "connectOptions.hosts"]));
        		if (connectOptions.hosts.length != connectOptions.ports.length)
        			throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"]));
        		for (var i = 0; i<connectOptions.hosts.length; i++) {
        			if (typeof connectOptions.hosts[i] !== "string")
        	        	throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.hosts[i], "connectOptions.hosts["+i+"]"]));
        			if (typeof connectOptions.ports[i] !== "number" || connectOptions.ports[i] < 0)
        	        	throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.ports[i], "connectOptions.ports["+i+"]"]));
        	    }
        	}

        	client.connect(connectOptions);
        };
     
        /** 
         * Subscribe for messages, request receipt of a copy of messages sent to the destinations described by the filter.
         * 
         * @name Messaging.Client#subscribe
         * @function
         * @param {string} filter describing the destinations to receive messages from.
         * <br>
         * @param {object} [subscribeOptions] used to control the subscription, as follows:
         * <p>
         * @config {number} [qos] the maiximum qos of any publications sent as a result of making this subscription.
         * @config {object} [invocationContext] passed to the onSuccess callback or onFailure callback.
         * @config {function} [onSuccess] called when the subscribe acknowledgement has been received from the server.
         * A single response object parameter is passed to the onSuccess callback containing the following fields:
         * <ol>
         * <li>invocationContext if set in the subscribeOptions.       
         * </ol>
         * @config {function} [onFailure] called when the subscribe request has failed or timed out.
         * A single response object parameter is passed to the onFailure callback containing the following fields:
         * <ol>
         * <li>invocationContext if set in the subscribeOptions.       
         * <li>errorCode a number indicating the nature of the error.
         * <li>errorMessage text describing the error.      
         * </ol>
         * @config {number} [timeout] which if present determines the number of seconds after which the onFailure calback is called
         * the presence of a timeout does not prevent the onSuccess callback from being called when the MQTT Suback is eventually received.         
    	 * @throws {InvalidState} if the client is not in connected state.
         */
        this.subscribe = function (filter, subscribeOptions) {
        	if (typeof filter !== "string")
        		throw new Error("Invalid argument:"+filter);
        	subscribeOptions = subscribeOptions || {} ;
        	validate(subscribeOptions,  {qos:"number", 
        		                         invocationContext:"object", 
        		                         onSuccess:"function", 
        		                         onFailure:"function",
        		                         timeout:"number"
        		                        });
        	if (subscribeOptions.timeout && !subscribeOptions.onFailure)
        		throw new Error("subscribeOptions.timeout specified with no onFailure callback.");
        	if (typeof subscribeOptions.qos !== "undefined" 
        		&& !(subscribeOptions.qos === 0 || subscribeOptions.qos === 1 || subscribeOptions.qos === 2 ))
    			throw new Error(format(ERROR.INVALID_ARGUMENT, [subscribeOptions.qos, "subscribeOptions.qos"]));
            client.subscribe(filter, subscribeOptions);
        };

        /**
         * Unsubscribe for messages, stop receiving messages sent to destinations described by the filter.
         * 
         * @name Messaging.Client#unsubscribe
         * @function
         * @param {string} filter describing the destinations to receive messages from.
         * @param {object} [unsubscribeOptions] used to control the subscription, as follows:
         * <p>
         * @config {object} [invocationContext] passed to the onSuccess callback or onFailure callback.
         * @config {function} [onSuccess] called when the unsubscribe acknowledgement has been receive dfrom the server.
         * A single response object parameter is passed to the onSuccess callback containing the following fields:
         * <ol>
         * <li>invocationContext if set in the unsubscribeOptions.     
         * </ol>
         * @config {function} [onFailure] called when the unsubscribe request has failed or timed out.
         * A single response object parameter is passed to the onFailure callback containing the following fields:
         * <ol>
         * <li>invocationContext if set in the unsubscribeOptions.       
         * <li>errorCode a number indicating the nature of the error.
         * <li>errorMessage text describing the error.      
         * </ol>
         * @config {number} [timeout] which if present determines the number of seconds after which the onFailure callback is called, the
         * presence of a timeout does not prevent the onSuccess callback from being called when the MQTT UnSuback is eventually received.
         * @throws {InvalidState} if the client is not in connected state.
         */
        this.unsubscribe = function (filter, unsubscribeOptions) {
        	if (typeof filter !== "string")
        		throw new Error("Invalid argument:"+filter);
        	unsubscribeOptions = unsubscribeOptions || {} ;
        	validate(unsubscribeOptions,  {invocationContext:"object", 
        		                           onSuccess:"function", 
        		                           onFailure:"function",
        		                           timeout:"number"
        		                          });
        	if (unsubscribeOptions.timeout && !unsubscribeOptions.onFailure)
        		throw new Error("unsubscribeOptions.timeout specified with no onFailure callback.");
            client.unsubscribe(filter, unsubscribeOptions);
        };

        /**
         * Send a message to the consumers of the destination in the Message.
         * 
         * @name Messaging.Client#send
         * @function 
         * @param {Messaging.Message} message to send.
         
         * @throws {InvalidState} if the client is not in connected state.
         */   
        this.send = function (message) {       	
            if (!(message instanceof Message))
                throw new Error("Invalid argument:"+typeof message);
            if (typeof message.destinationName === "undefined")
            	throw new Error("Invalid parameter Message.destinationName:"+message.destinationName);
           
            client.send(message);   
        };
        
        /** 
         * Normal disconnect of this Messaging client from its server.
         * 
         * @name Messaging.Client#disconnect
         * @function
         * @throws {InvalidState} if the client is not in connected or connecting state.     
         */
        this.disconnect = function () {
        	client.disconnect();
        };
        
        /** 
         * Get the contents of the trace log.
         * 
         * @name Messaging.Client#getTraceLog
         * @function
         * @return {Object[]} tracebuffer containing the time ordered trace records.
         */
        this.getTraceLog = function () {
        	return client.getTraceLog();
        }
        
        /** 
         * Start tracing.
         * 
         * @name Messaging.Client#startTrace
         * @function
         */
        this.startTrace = function () {
        	client.startTrace();
        };
        
        /** 
         * Stop tracing.
         * 
         * @name Messaging.Client#stopTrace
         * @function
         */
        this.stopTrace = function () {
            client.stopTrace();
        };
    };

    Client.prototype = {
        get host() { return this._getHost(); },
        set host(newHost) { this._setHost(newHost); },
        	
        get port() { return this._getPort(); },
        set port(newPort) { this._setPort(newPort); },
        	
        get clientId() { return this._getClientId(); },
        set clientId(newClientId) { this._setClientId(newClientId); },

        get onConnectionLost() { return this._getOnConnectionLost(); },
        set onConnectionLost(newOnConnectionLost) { this._setOnConnectionLost(newOnConnectionLost); },

        get onMessageDelivered() { return this._getOnMessageDelivered(); },
        set onMessageDelivered(newOnMessageDelivered) { this._setOnMessageDelivered(newOnMessageDelivered); },
        
        get onMessageArrived() { return this._getOnMessageArrived(); },
        set onMessageArrived(newOnMessageArrived) { this._setOnMessageArrived(newOnMessageArrived); }
    };
    
    /** 
     * An application message, sent or received.
     * <p>
     * Other programming languages,
     * <a href="/clients/java/doc/javadoc/com/ibm/micro/client/mqttv3/MqttMessage.html"><big>Java</big></a>,
     * <a href="/clients/c/doc/html/struct_m_q_t_t_client__message.html"><big>C</big></a>.
     * <p>
     * All attributes may be null, which implies the default values.
     * 
     * @name Messaging.Message
     * @constructor
     * @param {String|ArrayBuffer} payload The message data to be sent.
     * <p>
     * @property {string} payloadString <i>read only</i> The payload as a string if the payload consists of valid UTF-8 characters.
     * @property {ArrayBuffer} payloadBytes <i>read only</i> The payload as an ArrayBuffer.
     * <p>
     * @property {string} destinationName <b>mandatory</b> The name of the destination to which the message is to be sent
     *                    (for messages about to be sent) or the name of the destination from which the message has been received.
     *                    (for messages received by the onMessage function).
     * <p>
     * @property {number} qos The Quality of Service used to deliver the message.
     * <dl>
     *     <dt>0 Best effort (default).
     *     <dt>1 At least once.
     *     <dt>2 Exactly once.     
     * </dl>
     * <p>
     * @property {Boolean} retained If true, the message is to be retained by the server and delivered 
   	 *                     to both current and future subscriptions.
   	 *                     If false the server only delivers the message to current subscribers, this is the default for new Messages. 
   	 *                     A received message has the retained boolean set to true if the message was published 
   	 *                     with the retained boolean set to true
   	 *                     and the subscrption was made after the message has been published. 
   	 * <p>
     * @property {Boolean} duplicate <i>read only</i> If true, this message might be a duplicate of one which has already been received. 
     *                     This is only set on messages received from the server.
     *                     
     */
    var Message = function (newPayload) {  
    	var payload;
    	if (   typeof newPayload === "string" 
    		|| newPayload instanceof ArrayBuffer
    		|| newPayload instanceof Int8Array
    		|| newPayload instanceof Uint8Array
    		|| newPayload instanceof Int16Array
    		|| newPayload instanceof Uint16Array
    		|| newPayload instanceof Int32Array
    		|| newPayload instanceof Uint32Array
    		|| newPayload instanceof Float32Array
    		|| newPayload instanceof Float64Array
    	   ) {
            payload = newPayload;
        } else {
            throw (format(ERROR.INVALID_ARGUMENT, [newPayload, "newPayload"]));
        }

    	this._getPayloadString = function () {
    		if (typeof payload === "string")
       			return payload;
       		else
       			return parseUTF8(payload, 0, payload.length); 
    	};

    	this._getPayloadBytes = function() {
    		if (typeof payload === "string") {
    			var buffer = new ArrayBuffer(UTF8Length(payload));
    			var byteStream = new Uint8Array(buffer); 
    			stringToUTF8(payload, byteStream, 0);

    			return byteStream;
    		} else {
    			return payload;
    		};
    	};

    	var destinationName = undefined;
    	this._getDestinationName = function() { return destinationName; };
    	this._setDestinationName = function(newDestinationName) { 
    		if (typeof newDestinationName === "string")
    		    destinationName = newDestinationName;
    		else 
    			throw new Error(format(ERROR.INVALID_ARGUMENT, [newDestinationName, "newDestinationName"]));
    	};
    	    	
    	var qos = 0;
    	this._getQos = function() { return qos; };
    	this._setQos = function(newQos) { 
    		if (newQos === 0 || newQos === 1 || newQos === 2 )
    			qos = newQos;
    		else 
    			throw new Error("Invalid argument:"+newQos);
    	};

    	var retained = false;
    	this._getRetained = function() { return retained; };
    	this._setRetained = function(newRetained) { 
    		if (typeof newRetained === "boolean")
    		    retained = newRetained;
    		else 
    			throw new Error(format(ERROR.INVALID_ARGUMENT, [newRetained, "newRetained"]));
    	};
    	
    	var duplicate = false;
    	this._getDuplicate = function() { return duplicate; };
    	this._setDuplicate = function(newDuplicate) { duplicate = newDuplicate; };
    };
    
    Message.prototype = {
    	get payloadString() { return this._getPayloadString(); },
    	get payloadBytes() { return this._getPayloadBytes(); },
    	
    	get destinationName() { return this._getDestinationName(); },
    	set destinationName(newDestinationName) { this._setDestinationName(newDestinationName); },
    	
    	get qos() { return this._getQos(); },
    	set qos(newQos) { this._setQos(newQos); },

    	get retained() { return this._getRetained(); },
    	set retained(newRetained) { this._setRetained(newRetained); },

    	get duplicate() { return this._getDuplicate(); },
    	set duplicate(newDuplicate) { this._setDuplicate(newDuplicate); }
    };
       
    // Module contents.
    return {
        Client: Client,
        Message: Message
    };
})(window);

},{}],2:[function(require,module,exports){
var adapter = require('./lib/adapters/paho');
(function (global) {
    var Pume = require('./lib/pume');
    global.Pume = function (settings) {
        return new Pume(adapter, settings);
    }
})(window);
},{"./lib/adapters/paho":3,"./lib/pume":5}],3:[function(require,module,exports){
/**
 * http://git.eclipse.org/c/paho/org.eclipse.paho.mqtt.javascript.git/tree/src/mqttws31.js
 */

var utils = require('../utils');

exports.initialize = function (pume) {
    var settings = utils.extend({
        port: 1883,
        host: 'localhost'
    }, pume.settings);
    var client = pume.client = new Messaging.Client(settings.host, Number(settings.port), utils.makeId());

    client.onConnectionLost = function () {
        pume._disconnected();
    };
    client.onMessageArrived = function (message) {
        pume._message(message.destinationName, message.payloadString);
    };
    client.connect({onSuccess: function () {
        pume._connected();
    }});
    pume.adapter = new Paho(client);
};

function Paho(client) {
    this.client = client;
}

Paho.prototype.subscribe = function (cname, options, cb) {
    var opts = utils.extend({
        onSuccess: cb
    }, options);
    return this.client.subscribe(cname, opts);
};

Paho.prototype.unsubscribe = function (cname, options, cb) {
    var opts = utils.extend({
        onSuccess: cb
    }, options);
    return this.client.unsubscribe(cname, opts);
};

Paho.prototype.publish = function (cname, message) {
    var m = new Messaging.Message(message);
    m.destinationName = cname;
    return this.client.send(m);
};

Paho.prototype.close = function () {
    return this.client.disconnect();
};
},{"../utils":6}],4:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter;
var utils = require('./utils');
var util = require('util');

exports.Channels = Channels;

/**
 * Channel
 * @param channels
 * @param name
 * @returns {Channel}
 * @constructor
 */
function Channel(channels, name, options) {
    if (!(this instanceof Channel)) {
        return new Channel(channels, name, options);
    }
    this.channels = channels;
    this.adapter = channels.adapter;
    this.name = name;
    this.options = options;

    return this;
}

util.inherits(Channel, require('events').EventEmitter);

Channel.prototype.bind = Channel.prototype.on;

Channel.prototype.subscribe = function (cb) {
    var self = this;
    cb = cb || this.__callback__;
    if (this.__callback__) delete this.__callback__;
    this.adapter.subscribe(this.name, this.options, function (err) {
        if (cb) cb.call(self, err, self);
    });
    return this;
};

/**
 * unsubscribe - unsubscribe from channel
 *
 * @param {Function} [cb] - callback fired on unsuback
 * @returns {Channel} this - for chaining
 * @example channel.unsubscribe('topic');
 * @example channel.unsubscribe('topic', console.log);
 */
Channel.prototype.unsubscribe = function (cb) {
    this.adapter.unsubscribe(this.name, {}, cb);
    return this;
};

Channel.prototype.publish = function (event, data) {
    var message = JSON.stringify({__event__: event, __data__: data});
    this.adapter.publish(this.name, message);
    return this;
};

Channel.prototype.__handleMessage = function (message) {
    message = JSON.parse(message);
    if (message.__event__ && message.__data__) {
        this.emit(message.__event__, message.__data__);
    }
};

/**
 * Channels
 *
 * @param adapter
 * @constructor
 */
function Channels(adapter) {
    this.adapter = adapter;
    this._channels = {};
}

Channels.prototype.add = function (cname, options) {
    var c = this._channels[cname];
    if (!c) {
        c = new Channel(this, cname, options);
        this._channels[cname] = c;
    }
    return c;
};

Channels.prototype.remove = function (cname) {
    var channel = this._channels[cname];
    delete this._channels[cname];
    return channel;
};

Channels.prototype.channel = function (cname) {
    return this._channels[cname];
};

Channels.prototype.unsubscribeAll = function (cb) {
    if (!this.channels) return cb();
    var invokers = [];
    utils.forEach(this.channels, function (channel) {
        invokers.push(channel.unsubscribe.bind(channel));
    });
    return utils.parallel(invokers, cb);
};
},{"./utils":6,"events":8,"util":9}],5:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter;
var Channels = require('./channels').Channels;
var utils = require('./utils');
var util = require('util');

module.exports = Pume;

function Pume(name, settings) {
    var pume = this;
    // just save everything we get
    this.name = name;
    this.settings = settings || {};

    // and initialize pume using adapter
    // this is only one initialization entry point of adapter
    // this module should define `adapter` member of `this` (pume)
    var adapter;
    if (typeof name === 'object') {
        adapter = name;
        this.name = adapter.name;
    } else if (name.match(/^\//)) {
        // try absolute path
        adapter = require(name);
    } else {
        // try built-in adapter
        try {
            adapter = require('./adapters/' + name);
        } catch (e) {
            // try foreign adapter
            try {
                adapter = require('pume-' + name);
            } catch (e) {
                return console.log('\nWARNING: Pume adapter "' + name + '" is not installed,\nso your models would not work, to fix run:\n\n    npm install pume-' + name, '\n');
            }
        }
    }

    adapter.initialize(pume);

    // we have an adapter now?
    if (!pume.adapter) {
        throw new Error('Adapter is not defined correctly: it should create `adapter` member of pume');
    }

    pume.channels = new Channels(pume.adapter);

    return this;
}

util.inherits(Pume, require('events').EventEmitter);

Pume.prototype._connected = function () {
    this.connected = true;
    this.subscribeAll();
    this.emit('connected');
};

Pume.prototype._disconnected = function () {
    this.connected = false;
    this.emit('disconnected');
};

Pume.prototype._message = function (cname, message) {
    var c = this.channel(cname);
    if (c) c.__handleMessage(message);
};

Pume.prototype.close = function () {
    this.adapter.close();
};

Pume.prototype.channel = function (cname) {
    return this.channels.channel(cname);
};

Pume.prototype.subscribeAll = function() {
    for (var cname in this.channels._channels) {
        if (this.channels._channels.hasOwnProperty(cname)) {
            this.channels._channels[cname].subscribe();
        }
    }
};

Pume.prototype.subscribe = function (cname, options, cb) {
    var channel = this.channels.add(cname, options);
    if (channel.connected) {
        channel.subscribe(cb);
    } else if (cb) {
        channel.__callback__ = cb;
    }
    return channel;
};

Pume.prototype.unsubscribe = function (cname, cb) {
    cb = cb || utils.nop;
    var channel = this.channels.remove(cname, cb);
    if (channel.connected) {
        channel.unsubscribe(cb);
    } else {
        cb();
    }
    return this;
};

Pume.prototype.publish = function (cname, event, data) {
    if (!this.connected) throw new Error('Not connected');
    var channel = this.channels.channel(cname);
    return channel && channel.publish(event, data);
};
},{"./channels":4,"./utils":6,"events":8,"util":9}],6:[function(require,module,exports){
var breaker = {};

var ArrayProto = Array.prototype;

var nativeForEach = ArrayProto.forEach;
var slice = ArrayProto.slice;

exports.nop = function (){};

var each = exports.each = exports.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
        obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
        for (var i = 0, length = obj.length; i < length; i++) {
            if (iterator.call(context, obj[i], i, obj) === breaker) return;
        }
    } else {
        var keys = obj.keys;
        for (var i = 0, length = keys.length; i < length; i++) {
            if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
        }
    }
};


exports.extend = function (obj) {
    each(slice.call(arguments, 1), function(source) {
        if (source) {
            for (var prop in source) {
                obj[prop] = source[prop];
            }
        }
    });
    return obj;
};

exports.parallel = function (tasks, callback) {
    var results = [], count = tasks.length;
    tasks.forEach(function(task, index) {
        task(function(err, data) {
            results[index] = data;
            if(err) {
                callback(err);
                callback = null;
            }
            if(--count === 0 && callback) {
                callback(null, results);
            }
        });
    });
};

exports.makeId = function () {
    var i, possible, text;
    text = "";
    possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (i = 0; i < 5; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return 'pume-' + text;
};
},{}],7:[function(require,module,exports){


//
// The shims in this file are not fully implemented shims for the ES5
// features, but do work for the particular usecases there is in
// the other modules.
//

var toString = Object.prototype.toString;
var hasOwnProperty = Object.prototype.hasOwnProperty;

// Array.isArray is supported in IE9
function isArray(xs) {
  return toString.call(xs) === '[object Array]';
}
exports.isArray = typeof Array.isArray === 'function' ? Array.isArray : isArray;

// Array.prototype.indexOf is supported in IE9
exports.indexOf = function indexOf(xs, x) {
  if (xs.indexOf) return xs.indexOf(x);
  for (var i = 0; i < xs.length; i++) {
    if (x === xs[i]) return i;
  }
  return -1;
};

// Array.prototype.filter is supported in IE9
exports.filter = function filter(xs, fn) {
  if (xs.filter) return xs.filter(fn);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    if (fn(xs[i], i, xs)) res.push(xs[i]);
  }
  return res;
};

// Array.prototype.forEach is supported in IE9
exports.forEach = function forEach(xs, fn, self) {
  if (xs.forEach) return xs.forEach(fn, self);
  for (var i = 0; i < xs.length; i++) {
    fn.call(self, xs[i], i, xs);
  }
};

// Array.prototype.map is supported in IE9
exports.map = function map(xs, fn) {
  if (xs.map) return xs.map(fn);
  var out = new Array(xs.length);
  for (var i = 0; i < xs.length; i++) {
    out[i] = fn(xs[i], i, xs);
  }
  return out;
};

// Array.prototype.reduce is supported in IE9
exports.reduce = function reduce(array, callback, opt_initialValue) {
  if (array.reduce) return array.reduce(callback, opt_initialValue);
  var value, isValueSet = false;

  if (2 < arguments.length) {
    value = opt_initialValue;
    isValueSet = true;
  }
  for (var i = 0, l = array.length; l > i; ++i) {
    if (array.hasOwnProperty(i)) {
      if (isValueSet) {
        value = callback(value, array[i], i, array);
      }
      else {
        value = array[i];
        isValueSet = true;
      }
    }
  }

  return value;
};

// String.prototype.substr - negative index don't work in IE8
if ('ab'.substr(-1) !== 'b') {
  exports.substr = function (str, start, length) {
    // did we get a negative start, calculate how much it is from the beginning of the string
    if (start < 0) start = str.length + start;

    // call the original function
    return str.substr(start, length);
  };
} else {
  exports.substr = function (str, start, length) {
    return str.substr(start, length);
  };
}

// String.prototype.trim is supported in IE9
exports.trim = function (str) {
  if (str.trim) return str.trim();
  return str.replace(/^\s+|\s+$/g, '');
};

// Function.prototype.bind is supported in IE9
exports.bind = function () {
  var args = Array.prototype.slice.call(arguments);
  var fn = args.shift();
  if (fn.bind) return fn.bind.apply(fn, args);
  var self = args.shift();
  return function () {
    fn.apply(self, args.concat([Array.prototype.slice.call(arguments)]));
  };
};

// Object.create is supported in IE9
function create(prototype, properties) {
  var object;
  if (prototype === null) {
    object = { '__proto__' : null };
  }
  else {
    if (typeof prototype !== 'object') {
      throw new TypeError(
        'typeof prototype[' + (typeof prototype) + '] != \'object\''
      );
    }
    var Type = function () {};
    Type.prototype = prototype;
    object = new Type();
    object.__proto__ = prototype;
  }
  if (typeof properties !== 'undefined' && Object.defineProperties) {
    Object.defineProperties(object, properties);
  }
  return object;
}
exports.create = typeof Object.create === 'function' ? Object.create : create;

// Object.keys and Object.getOwnPropertyNames is supported in IE9 however
// they do show a description and number property on Error objects
function notObject(object) {
  return ((typeof object != "object" && typeof object != "function") || object === null);
}

function keysShim(object) {
  if (notObject(object)) {
    throw new TypeError("Object.keys called on a non-object");
  }

  var result = [];
  for (var name in object) {
    if (hasOwnProperty.call(object, name)) {
      result.push(name);
    }
  }
  return result;
}

// getOwnPropertyNames is almost the same as Object.keys one key feature
//  is that it returns hidden properties, since that can't be implemented,
//  this feature gets reduced so it just shows the length property on arrays
function propertyShim(object) {
  if (notObject(object)) {
    throw new TypeError("Object.getOwnPropertyNames called on a non-object");
  }

  var result = keysShim(object);
  if (exports.isArray(object) && exports.indexOf(object, 'length') === -1) {
    result.push('length');
  }
  return result;
}

var keys = typeof Object.keys === 'function' ? Object.keys : keysShim;
var getOwnPropertyNames = typeof Object.getOwnPropertyNames === 'function' ?
  Object.getOwnPropertyNames : propertyShim;

if (new Error().hasOwnProperty('description')) {
  var ERROR_PROPERTY_FILTER = function (obj, array) {
    if (toString.call(obj) === '[object Error]') {
      array = exports.filter(array, function (name) {
        return name !== 'description' && name !== 'number' && name !== 'message';
      });
    }
    return array;
  };

  exports.keys = function (object) {
    return ERROR_PROPERTY_FILTER(object, keys(object));
  };
  exports.getOwnPropertyNames = function (object) {
    return ERROR_PROPERTY_FILTER(object, getOwnPropertyNames(object));
  };
} else {
  exports.keys = keys;
  exports.getOwnPropertyNames = getOwnPropertyNames;
}

// Object.getOwnPropertyDescriptor - supported in IE8 but only on dom elements
function valueObject(value, key) {
  return { value: value[key] };
}

if (typeof Object.getOwnPropertyDescriptor === 'function') {
  try {
    Object.getOwnPropertyDescriptor({'a': 1}, 'a');
    exports.getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  } catch (e) {
    // IE8 dom element issue - use a try catch and default to valueObject
    exports.getOwnPropertyDescriptor = function (value, key) {
      try {
        return Object.getOwnPropertyDescriptor(value, key);
      } catch (e) {
        return valueObject(value, key);
      }
    };
  }
} else {
  exports.getOwnPropertyDescriptor = valueObject;
}

},{}],8:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util');

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!util.isNumber(n) || n < 0)
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (util.isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (util.isUndefined(handler))
    return false;

  if (util.isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (util.isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!util.isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              util.isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (util.isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (util.isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!util.isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      console.trace();
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!util.isFunction(listener))
    throw TypeError('listener must be a function');

  function g() {
    this.removeListener(type, g);
    listener.apply(this, arguments);
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!util.isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (util.isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (util.isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (util.isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (util.isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (util.isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};
},{"util":9}],9:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var shims = require('_shims');

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};

/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  shims.forEach(array, function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = shims.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = shims.getOwnPropertyNames(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }

  shims.forEach(keys, function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = shims.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }

  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (shims.indexOf(ctx.seen, desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = shims.reduce(output, function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return shims.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) && objectToString(e) === '[object Error]';
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.binarySlice === 'function'
  ;
}
exports.isBuffer = isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = shims.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = shims.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

},{"_shims":7}]},{},[1,2])
;