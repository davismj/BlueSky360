//					  //
// create audio nodes //
//					  //
var audio = new (window.AudioContext || window.webkitAudioContext)(),
	requestAnimationFrame = requestAnimationFrame || function(f) { setTimeout(f, 16); };
audio.createGain == audio.createGain || audio.createGainNode;
audio.listener.setPosition(0,0,0);

var main = audio.createGain();
main.gain.value = 1.0;

var lopass = audio.createBiquadFilter();
lopass.type = 'lowpass';
lopass.frequency.value = 48000;
lopass.connect(main);

var hipass = audio.createBiquadFilter();
hipass.type = 'highpass';
hipass.frequency.value = 0;
hipass.connect(lopass);

var panner = audio.createPanner();
panner.coneOuterGain = 0.25;
panner.coneOuterAngle = 270;
panner.coneInnerAngle = 90;
panner.connect(hipass);

var leadVolume = audio.createGain(),
	foundVolume = audio.createGain();
leadVolume.gain.value = 1.5;
leadVolume.connect(panner);
foundVolume.gain.value = 0.5;
foundVolume.connect(hipass);

var leadPosition,
positionXhr = new XMLHttpRequest();
positionXhr.open('GET', 'js/lead.json', true);
positionXhr.onload = function() {
	leadPosition = JSON.parse(positionXhr.responseText);
};
positionXhr.send();
 
//			  //
//  add audio //
//			  //

// set the video quality
var ext = 'ogg';

// and add on load functionality
	loaded = 0,
	onLoad = function() { ++loaded == 2 && (hideLoading() || connectAudio()); },
	hideLoading = function() { document.getElementById('loading').remove(); }

// foundation track
var found,
	foundXhr = new XMLHttpRequest();
foundXhr.open("GET", 'audio/Blue Sky Foundation.' + ext, true);
try {
	foundXhr.responseType = "arraybuffer";
}
catch(err) {
	// not supported, browser probably won't play video
}
foundXhr.onload = function() {
	audio.decodeAudioData(foundXhr.response, function(buffer) {
    	found = buffer;
    	onLoad();
	});
};
foundXhr.send();

// lead track
var lead,
	leadXhr = new XMLHttpRequest();
leadXhr.open("GET", 'audio/Blue Sky Lead.' + ext, true);
try {
	leadXhr.responseType = "arraybuffer";	
}
catch(err) {
	// not supported, browser probably won't play video
}
leadXhr.onload = function() {
	audio.decodeAudioData(leadXhr.response, function(buffer) {
    	lead = buffer;
    	onLoad();
	});
};
leadXhr.send();

//						   //
// integrate the Kolor API //
//						   //
var player,
	updateRate = 16,
	onKolorEyesIframeAPIReady = function() {
		player = new KolorEyesIframeAPI('main', {
		    events: { 
		    	onConnected: function onConnected() {
					player.disableUI('seek');
					player.setVelocity(4.0);
					player.setUpdateRate(updateRate);
		    	},
		    	onPlay: function onPlay() {
		    		document.getElementById('main')
		    			.className = 'playing';
				},
		        onPause: function onPause() { 
		    		document.getElementById('main')
		    			.className = 'paused';
				},
				onEnded: function onEnded() {
		    		document.getElementById('main')
		    			.className = 'ended';
	    			connectAudio();
				},
		        onVolumeChange: function onVolumeChange() {
					main.gain.value = player.getVolume();
				},
				onSeek: function onSeek() {
					player.play();
				}
		    }
		});
		player.hideUI('SEEK');

		// enter the audio loop
		updateAudio();
	}; 

// 			   //
// update loop //
// 			   //
function updateAudio() {

	// grab the current time
	var time = player.getCurrentTime();

	// if not playing, disconnect audio 
	if (!player.isPlaying())// || failCount > 1)
		main.disconnect();
	
	else {

		// otherwise, connect the audio?
		main.connect(audio.destination);

		// grab pitch, yaw, and time
		var pitch = getRadians(player.getPitch());
			yaw = getRadians(player.getYaw());

		// set hipass/lopass according to current pitch
		lopass.frequency.value = getLowPassFrequency(pitch);
		hipass.frequency.value = getHighPassFrequency(pitch);

		// switch to a new position item if the current time matches
		if (leadPosition[1] && leadPosition[1][0] < time)
			leadPosition.shift();

		// set the panner according to the current yaw and position data
		dTheta = yaw - leadPosition[0][1];
		panner.setOrientation.apply(panner, getPannerOrientation(dTheta));
		panner.setPosition.apply(panner, getPannerPosition(dTheta));
	}

	// continue the loop
	requestAnimationFrame(updateAudio);
}

//							  //
// audio processing functions //
//							  //
var foundSource, leadSource;
function connectAudio(time) {

	if (foundSource)
		foundSource.disconnect();

	if (leadSource)
		leadSource.disconnect();

	foundSource = audio.createBufferSource();
	foundSource.buffer = found;
	foundSource.start(0);
	foundSource.connect(foundVolume);

	leadSource = audio.createBufferSource();
	leadSource.buffer = lead;
	leadSource.start(0);	
	leadSource.connect(leadVolume);
}

function getPannerOrientation(theta) {
	if (theta > Math.PI / 2)
		theta = (1.5 * Math.PI) + theta; 
	else if (theta < -Math.PI / 2) 
		theta = (1.5 * Math.PI) + theta;
	else 
		theta = (0.5 * Math.PI) - theta;
	return [Math.cos(theta), -Math.sin(theta), 1];
}

function getPannerPosition(theta) {
	theta += Math.PI / 2;
    return [2 * Math.cos(theta), 2 * Math.sin(theta), -0.5]
}

var START = 0.30 * Math.PI,
	END = 0.45 * Math.PI,
	DIFF = START - END;

// everything above the return value is filtered out
function getLowPassFrequency(pitch) {
	if (pitch < START) return 48000;
	else {
		if (pitch > END) return 250;
		else {

			// x^(1/10) increases more quickly near 0, or, in this case,
			// the frequency decreases more rapidly at first
			return 48000 - 47750 * Math.pow(((START - pitch) / DIFF), 0.1)
		}
	}
}

// everything below the return value is filtered out
function getHighPassFrequency(pitch) {
	pitch = -pitch;
	if (pitch < START) return 0;
	else {
		if (pitch > END) return 4800;
		else {

			// x^2 increases more quickly near 1, or, in this case,
			// the frequency decreases more rapidly at the end
			return 4800 * Math.pow(((START - pitch) / DIFF), 2)
		}
	}
}

function getRadians(degrees) {
	return degrees * 0.0174532925;
}