var express = require('express')
	, request = require('request')
	, path = require('path')
	, multer = require('multer')
	, redis = require("redis")
	, lwip = require('lwip')
	, sha1 = require('sha1')
	, fs = require('fs')
	, freegeoip = require('node-freegeoip')
	, qs = require('querystring');

// Configuration.
var appURL = 'https://plex-discord-webhook.herokuapp.com';
var webhookKey = process.env.DISCORD_WEBHOOK_KEY;

var redisClient = redis.createClient(process.env.REDISCLOUD_URL, { return_buffers: true });
var upload = multer({ storage: multer.memoryStorage() });
var app = express();

app.use(express.static('images'));

function formatTitle(metadata) {
	if (metadata.grandparentTitle) {
		return metadata.grandparentTitle;
	} else {
		var ret = metadata.title;
		if (metadata.year) {
			ret += ' (' + metadata.year + ')';
		}
		return ret;
	}
}

function formatSubtitle(metadata) {
	var ret = '';
	if (metadata.grandparentTitle) {
		if (metadata.type == 'track') {
			ret = metadata.parentTitle;
		} else if (metadata.index && metadata.parentIndex) {
			ret = "S" + metadata.parentIndex + " E" + metadata.index;
		} else if (metadata.originallyAvailableAt) {
			ret = metadata.originallyAvailableAt;
		}

		if (metadata.title) {
			ret += ' - ' + metadata.title;
		}
	} else if (metadata.type == 'movie') {
		ret = metadata.tagline;
	}

	return ret;
}

function formatSummary(summary) {
	var ret = '';

	if (summary) {
		if (summary.length > 300) {
			ret = summary.substring(0, 300) + '...';
		}
		else {
			ret = summary;
		}

		if (ret.length > 0)
			ret = '\r\n' + ret;
	}

	return ret;
}

function notifyDiscord(imageUrl, payload, location, action) {
	var locationText = '';
	if (location) {
		locationText = ' near ' + location.city + ', ' + (location.country_code == 'US' ? location.region_name : location.country_name);
	}

	var data = {
		"content": "",
		"username": "Plex",
		"avatar_url": appURL + "/plex-icon.png",
		"embeds": [
			{
				"title": formatTitle(payload.Metadata),
				"description": formatSubtitle(payload.Metadata) + formatSummary(payload.Metadata.summary),
				"footer": {
					"text": action + " by " + payload.Account.title + " on " + payload.Player.title + " from " + payload.Server.title + locationText,
					"icon_url": payload.Account.thumb
				},
				"thumbnail": {
					"url": imageUrl,
					"height": 200,
					"width": "200"
				}
			}
		]
	};

	request.post('https://discordapp.com/api/webhooks/' + webhookKey,
		{ json: data },
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
				console.log(body)
			}
		}
	);

	//var options = {
	//	host: 'discordapp.com',
	//	port: 443,
	//	path: '/api/webhooks/' + webhookKey,
	//	method: 'POST',
	//	headers: {
	//		'Content-Type': 'application/json',
	//		'Content-Length': Buffer.byteLength(data)
	//	}
	//}

	//var httpreq = http.request(options, function (response) {
	//	response.setEncoding('utf8');
	//	response.on('data', function (chunk) {
	//		console.log("body: " + chunk);
	//	});
	//	response.on('end', function () {
	//		//res.send('ok');
	//	})
	//});

	//httpreq.write(data);
	//httpreq.end();

	console.log('post complete');
}

app.post('/', upload.single('thumb'), function (req, res, next) {
	var payload = JSON.parse(req.body.payload);
	var isVideo = (payload.Metadata.librarySectionType == "movie" || payload.Metadata.librarySectionType == "show");
	var isAudio = (payload.Metadata.librarySectionType == "artist");

	if (payload.user == true && payload.Metadata && (isAudio || isVideo)) {
		var key = sha1(payload.Server.uuid + payload.Metadata.guid);

		if (payload.event == "media.play" || payload.event == "media.rate") {
			// Save the image.
			if (req.file && req.file.buffer) {
				console.log('Saving the image');
				lwip.open(req.file.buffer, 'jpg', function (err, image) {
					image.contain(75, 75, 'white', function (err, smallerImage) {
						smallerImage.toBuffer('jpg', function (err, buffer) {
							redisClient.setex(key, 7 * 24 * 60 * 60, buffer);
						});
					});
				});
			}
		}

		if ((payload.event == "media.scrobble" && isVideo) || payload.event == "media.rate") {
			// Geolocate player.
			freegeoip.getLocation(payload.Player.publicAddress, function (err, location) {

				var action;
				if (payload.event == "media.scrobble") {
					action = "played";
				} else {
					if (payload.rating > 0) {
						action = "rated ";
						for (var i = 0; i < payload.rating / 2; i++)
							action += "★";
					} else {
						action = "unrated";
					}
				}
				
				// Send the event to Discord.
				redisClient.get(key, function (err, reply) {
					if (reply) {
						notifyDiscord(appURL + '/images/' + key, payload, location, action);
					} else {
						notifyDiscord(null, payload, location, action);
					}
				});
			});
		}
	}

	res.sendStatus(200);
});

app.get('/images/:key', function (req, res, next) {
	redisClient.get(req.params.key, function (err, value) {
		if (err) {
			next(err);
		} else {
			if (!value) {
				next();
			} else {
				res.setHeader('Content-Type', 'image/jpeg');
				res.end(value);
			}
		}
	});
});

app.listen(process.env.PORT || 11000);