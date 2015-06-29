// using a closure to protect global variables
(function () {

	// Add some methods to aid in grabbing random elements from arrays
	Array.prototype.randomElement = function () {
		return this[Math.floor(Math.random() * this.length)]
	}


	// Add method for title case
	String.prototype.toTitleCase = function () {
		return this.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
	};

	// Global variables
	var width, 
	height, 
	projection, 
	path, 
	zoom, 
	svg, 
	map, 
	selected, 
	mergedSelected, 
	merges, 
	munis, 
	allPlaceFps,
	stats,
	shared;


	function getUrlParameter( name, url ) {
		if (!url) url = location.href
		name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
		var regexS = "[\\?&]"+name+"=([^&#]*)";
		var regex = new RegExp( regexS );
		var results = regex.exec( url );
	return results == null ? null : results[1];
	}


	// ####################################
	// ####################################
	// ##
	// ##  JQUERY READY HANDLER 
	// ## 
	// ####################################
	// ####################################

	jQuery(document).ready(function($) {
		width = $('#map').width();
		height = $('#map').height();

		// ========================================================
		// BEGIN: CODE FOR CENTERING THE MAP
		// adapted from: http://stackoverflow.com/a/14654988/566307
		// Create a unit projection.
		projection = d3.geo.albersUsa()
			.scale(1)
			.translate([0, 0]);
		// Create a path generator.
		path = d3.geo.path()
			.projection(projection);
		// END
		// ========================================================

		function zoomed() {
		  map.style("stroke-width", 1.5 / d3.event.scale + "px");
		  map.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
		}

		zoom = d3.behavior.zoom()
			.translate([0, 0])
			.scale(1)
			.scaleExtent([1, 8])
			.on("zoom", zoomed);


		svg = d3.select("#map").append("svg")
			.attr("width", width)
			.attr("height", height);
			// .on("click", stopped, true);

		map = svg.append("g");

		svg
			.call(zoom) // delete this line to disable free zooming
			.call(zoom.event);

		selected = [];
		merges = [];
		allPlaceFps = [];


		// Check if there's a map parameter (user clicked a share link)
		var userMap = getUrlParameter("map");
		if (userMap) {
			try {
				merges = JSON.parse( LZString.decompressFromEncodedURIComponent( userMap ) );
				shared = true;
			} 
			catch(e){
				// error-handling would go here. For now, I'm just going to reset merges to an empty array.
				merges = [];
				shared = false
			}
		}
		else {
			shared = false;
		}

		// Hide share button on load.
		// It will be turned on when user creates their first merge.
		$('#map-share').prop("disabled",true);

		// Load the map's geopgraphy into D3
		d3.json("data/cleaned-30.topojson", function(error, data) {

			// clone and store the data in a global variable so we can access it later
			munis = jQuery.extend(true, {}, data);

			// Iterate over all munis and store their PlaceFP codes so we can check stuff later
			for (var i=0; i<munis.objects.municipalities.geometries.length; i++) {
				allPlaceFps.push( munis.objects.municipalities.geometries[i].properties.placefp );
			}

			// ========================================================
			// BEGIN: CODE FOR CENTERING THE MAP
			// adapted from: http://stackoverflow.com/a/14654988/566307
			// Compute the bounds of a feature of interest, then derive scale & translate.
			// Note: I moved this code here from the top of buildMap(), so it only runs once.
			// Things went nuts when I was recalculating whenever buildMap() was called.
			var b = path.bounds( topojson.feature(data, data.objects.municipalities) ),
				s = .95 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height),
				t = [(width - s * (b[1][0] + b[0][0])) / 2, (height - s * (b[1][1] + b[0][1])) / 2];

			// Update the projection to use computed scale & translate.
			projection
				.scale(s)
				.translate(t);
			// END
			// ========================================================

			// Load the demographic/income data.
			// Once loaded, store a copy in global Stats variable, then call the BuildMap function
			$.when( 
				$.ajax({
					url: "data/st-louis-county-muni-data-final.json" ,
					dataType: "json"
				}) 
			).then( 
				function( data2, textStatus, jqXHR ) {
					stats = jQuery.extend(true, {}, data2);
					buildMap(data);
				}
			);

		});



		// MAP CONTROL CLICK HANDLERS
		// Merge button
		$("#map-merge").on("click", function() {
			// Pop up box to ask user to name their new merged muni
			var bPopup = $('#merge-name-popup').bPopup({
				// ===========================
				// BEGIN NAME GENERATING CODE
				// This got a lot more complicated than I originally thought
				// ===========================

				// When we open the dialog, we need to generate possible names for the merged muni
				// and add them to the form. 
				onOpen: function() {
					namePieces = {
						"pre":[],
						"pieces":[],
						"suf":[],
						"words":[]
					}
					var allNamePieces = [];
					var names = [];
					var newNames = [];
					var stLouisCity = false;
					var stLouisCounty = false;

					// Compile new name pieces
					for (var i=0; i<selected.length; i++) {
						var thisPlaceFp = selected[i].getAttribute('data-placefp');
						// Check if this muni is St. Louis city or County
						if (thisPlaceFp == '65000' ) { stLouisCity = true; }
						else if (thisPlaceFp == '99999' ) { stLouisCounty = true; }

						// Handle an actual muni
						if ( allPlaceFps.indexOf( thisPlaceFp ) > -1 ) {
							// append new name pieces
							namePieces['pre'] = namePieces['pre'].concat( stats[thisPlaceFp]['pre'] );
							namePieces['pieces'] = namePieces['pieces'].concat( stats[thisPlaceFp]['pieces'] );
							namePieces['suf'] = namePieces['suf'].concat( stats[thisPlaceFp]['suf'] );
							namePieces['words'] = namePieces['words'].concat( stats[thisPlaceFp]['words'] );
							// append name to name list
							names.push( selected[i].getAttribute('data-name') );
							// append all pieces to allNamePieces list
							allNamePieces = allNamePieces.concat( stats[thisPlaceFp]['pre'] );
							allNamePieces = allNamePieces.concat( stats[thisPlaceFp]['pieces'] );
							allNamePieces = allNamePieces.concat( stats[thisPlaceFp]['suf'] );
							allNamePieces = allNamePieces.concat( stats[thisPlaceFp]['words'] );
						}
						// Handle a mergeset.
						else {
							// Iterate over all mergesets
							for (var j=merges.length - 1; j>= 0; j--) {
								// Check if this is the mergeset we're looking for
								if ( merges[j]['placefp'] == thisPlaceFp ) {
									// Okay, now get all the munis from this mergeset
									for (var k=0; k<merges[j]["munis"].length; k++) {
										// Add it to our list of munis to be merged
										var thisMuniPlaceFp = merges[j]["munis"][k]
										// Check if this muni is St. Louis city or County
										if (thisPlaceFp == '65000' ) { stLouisCity = true; }
										else if (thisPlaceFp == '99999' ) { stLouisCounty = true; }
										// append new name pieces
										namePieces['pre'] = namePieces['pre'].concat( stats[thisMuniPlaceFp]['pre'] );
										namePieces['pieces'] = namePieces['pieces'].concat( stats[thisMuniPlaceFp]['pieces'] );
										namePieces['suf'] = namePieces['suf'].concat( stats[thisMuniPlaceFp]['suf'] );
										namePieces['words'] = namePieces['words'].concat( stats[thisMuniPlaceFp]['words'] );
										// append all pieces to allNamePieces list
										allNamePieces = allNamePieces.concat( stats[thisMuniPlaceFp]['pre'] );
										allNamePieces = allNamePieces.concat( stats[thisMuniPlaceFp]['pieces'] );
										allNamePieces = allNamePieces.concat( stats[thisMuniPlaceFp]['suf'] );
										allNamePieces = allNamePieces.concat( stats[thisMuniPlaceFp]['words'] );
										// The names are stored in the D3 geometries object
										// So, find the right object
										var thisMuniGeometry = munis.objects.municipalities.geometries.filter(function( obj ) {
											return obj.properties.placefp == thisMuniPlaceFp;
										});
										// now push the muni's name onto our running name list
										names.push( thisMuniGeometry[0].properties.name );
									}
								}
							}
						}
					}
					var preWeight = 0.2;
					var piecesWeight = 0.3;
					var sufWeight = 0.2;
					var wordsWeight1 = 0.5;
					var wordsWeight2 = 0.8;

					// If there aren't words, then make it more likely prefix, suffix, pieces won't be skipped
					if ( namePieces["words"].length < 1 ) {
						preWeight -= 0.1;
						sufWeight -= 0.1;
						piecesWeight -= 0.1;
					}
					// If there aren't pieces, then make sure prefix and suffix won't be skipped
					if ( namePieces["pieces"].length < 1 ) {
						preWeight = 0;
						sufWeight = 0;
					}

					for (var z=0; z<5; z++) {
						// using a do-while loop to ensure we get unique names that
						// don't match previously-generated names or existing muni names.
						// 
						// Also, be careful with this loop. In some cases, fewer than five 
						// combinations can be assembled, which means the while() condition
						// never gets fulfilled, and the loop runs infinitely.
						// 
						// To avoid this, I will add a counter which forces the loop to break 
						// if it runs too many times.
						var numCalls = 0;
						do {
							numCalls++;
							if (numCalls > 20) { break; }

							var name = '';
							if (namePieces["pre"].length > 0 && (Math.random() > preWeight) ) {
								name += namePieces["pre"].randomElement();
							}
							if (namePieces["pieces"].length > 0 && (Math.random() > piecesWeight) ) {
								name += namePieces["pieces"].randomElement();
							}
							if (namePieces["suf"].length > 0 && (Math.random() > sufWeight) ) {
								name += namePieces["suf"].randomElement();
							}
							if (namePieces["words"].length > 0 && (Math.random() > wordsWeight1) ) {
								var word1 = namePieces["words"].randomElement();
								name += ' ';
								name += word1;
								// remove this word from the word list so it doesn't get reused.
								var index = namePieces['words'].indexOf(word1);
								namePieces['words'].splice(index, 1);
							}
							if (namePieces["words"].length > 0 && (Math.random() > wordsWeight2) ) {
								name += ' ';
								name += namePieces["words"].randomElement();
							}
							// name cleanup
							name = name.toTitleCase().trim();
							name = name.replace(/(.)\1{2,}/g, '$1$1');
							name = name.replace('eette', 'ette');
							// remove stray bits
							if (name == 'St.' ||  name == 'Louis' ) { name = 'St. Louis'; }
						// if the name is in either the muni list, or the new name list, then re-run the loop
						} while ( names.indexOf(name) > -1 || newNames.indexOf(name) > -1 );
						// Add to the new names list, but only if it's not an empty string
						if ( name > '' ) {
							newNames.push( name );
						}
					}
					// Remove any duplicates from the newNames array (these occur in merges
					// where there isn't much material to start with, and we are forced to
					// break the while loop early.)
					newNames = newNames.filter(function(item, pos, self) {
						return self.indexOf(item) == pos;
					});

					// Iterate over allNamePieces and cleanup so we can do straight comparison
					for (var x=0; x<allNamePieces.length; x++) {
						allNamePieces[x] = allNamePieces[x].toTitleCase().trim();
					}

					// Add a "St. Louis" option if St. Louis city or uninc St. Louis County is one of the munis selected
					if (stLouisCity) {
						$('#merge-name-popup select').append('<option>St. Louis</option>');
					}
					else if (stLouisCounty) {
						$('#merge-name-popup select').append('<option>Unincorporated St. Louis County</option>');
					}
					// Append all the auto-generated options to the name select list
					for (var y=0; y<newNames.length; y++) {
						// Check one last time to make sure they're not in the muni list.
						// And check to make sure the name is not just one of the pieces by itself.
						if ( names.indexOf(newNames[y]) == -1 && allNamePieces.indexOf(newNames[y]) == -1 ) {
							$('#merge-name-popup select').append('<option>' + newNames[y] + '</option>');
						}
					}
				},

				// After they submit the form 
				onClose: function() {
					// Store user's submitted name
					var newName = $('#merge-name-popup option:selected').text();
					// If they didn't submit anything, use generic label
					if ( !newName.trim() > '' ) {
						newName = 'Merged municipality'
					}
					// empty the name select list so it can be re-used later.
					$('#merge-name-popup select').empty();

					// BEGIN MERGING LOGIC
					// 1. Create mergeSet object
					var mergeSet = {};
					mergeSet["name"] = newName;
					mergeSet["munis"] = [];


					// 2. Compile list of all municipalities to be merged.
					//    Also, compile new name pieces
					for (var i=0; i<selected.length; i++) {
						var thisPlaceFp = selected[i].getAttribute('data-placefp');
						// 2a. Is this selection element in our AllPlaceFps list? If so, it's a single muni.
						if ( allPlaceFps.indexOf( thisPlaceFp ) > -1 ) {
							// Add it to our list of munis to be merged
							mergeSet["munis"].push( thisPlaceFp );
						}
						// 2b. It is NOT in the list. That means it's a mergeset.
						else {
							// Iterate over all mergesets
							for (var j=merges.length - 1; j>= 0; j--) {
								// Check if this is the mergeset we're looking for
								if ( merges[j]['placefp'] == thisPlaceFp ) {
									// Okay, now get all the munis from this mergeset
									for (var k=0; k<merges[j]["munis"].length; k++) {
										// Add it to our list of munis to be merged
										mergeSet["munis"].push( merges[j]["munis"][k] );
									}
									// Now remove this old mergeset from the master merges list
									merges.splice(j,1);
								}
							}
						}
					}

					// generate dummy placefp
					var mergeSetSum = mergeSet["munis"].reduce(function(a, b){return parseInt(a)+parseInt(b);})
					mergeSet["placefp"] = (mergeSetSum * Math.random()).toString(36).substr(2, 5);

					// Append the merge set to our master list of mergesets
					merges.push(mergeSet);
					resetMessage();
					resetControls();
					selected.length = 0; // empty the selected array
					buildMap(munis);
				}
			});

			// Close the popup when "Submit" button is clicked
			$('#merge-name-popup button').on("click", function() {
				bPopup.close();
			});

			// Close the popup if user hits "enter" in the input field
			$("#merge-name-popup input").keyup(function (e) {
				if (e.keyCode == 13) {
					bPopup.close();
				}
			});

		}); // end map-merge click handler 



		// Split button
		$("#map-split").on("click", function() {
			// Iterate over selection and find any mergesets
			for (var i=0; i<selected.length; i++) {
				var thisPlaceFp = selected[i].getAttribute('data-placefp');
				// If it's not in allPlaceFps, then its' a mergeset
				if ( allPlaceFps.indexOf( thisPlaceFp ) == -1 ) {
					// Iterate over master mergeset list
					for (var j=merges.length - 1; j>= 0; j--) {
						// Check if this is the mergeset we're looking for
						if ( merges[j]['placefp'] == thisPlaceFp ) {
							// Remove this mergeset from the master merges list
							merges.splice(j,1);
						}
					}
				}
			}
			resetMessage();
			resetControls();
			selected.length = 0; // empty the selected array
			buildMap(munis);
		}); // end map-merge click handler 



		// Share button
		$("#map-share").on("click", function() {
			if ( merges.length > 0 && shared == false) {
				var mapCode = LZString.compressToEncodedURIComponent( JSON.stringify(merges) );
				var encShareUrl = 'http://staging.graphics.stltoday.com/apps/one-st-louis/index.html?map=' + mapCode;

				var fbShare = 'https://www.facebook.com/sharer.php?u=' + encShareUrl;
				var twShare = 'https://twitter.com/intent/tweet?source=tweetbutton&text=I%20just%20built%20a%20new%20St.%20Louis.%20Check%20it%20out%20on%20%40stltoday.%20&url=' + encShareUrl + '&via=stltoday';

				$('#shareFb').attr('href', fbShare);
				$('#shareTw').attr('href', twShare);
				$('#shareUr').attr('href', encShareUrl);

				var bPopup = $('#share-popup').bPopup();
			}
		}); // end map-selectall click handler 


		// This code initiates a D3 click event in jQuery.
		// Adapted from: http://stackoverflow.com/a/11180172/566307
		jQuery.fn.d3Click = function () {
			this.each(function (i, e) {
				var evt = document.createEvent("MouseEvents");
				evt.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);

				e.dispatchEvent(evt);
			});
		};

		// Select All button
		$("#map-selectall").on("click", function() {
			// empty the selected array
			selected.length = 0; 
			// map.selectAll("path.muni:not(.merged):not(.uninc)").each( function(d) {
			map.selectAll("path.muni").each( function(d) {
				$(this).d3Click();
			});


		}); // end map-selectall click handler 


		// Reset button
		$("#map-reset").on("click", function() {
			resetMessage();
			resetControls();
			selected.length = 0; // empty the selected array
			merges.length = 0; // empty the merges array
			buildMap(munis);
		}); // end map-reset click handler 


	}); // end jQuery ready handler




	// ####################################
	// ####################################
	// ##
	// ##  HELPER FUNCTIONS
	// ## 
	// ####################################
	// ####################################


	function formatMoney(n) {
		if (typeof n === "number") {
			return '$' + n.toFixed(0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}
		return n
	}

	function formatCommas(n) {
		if (typeof n === "number") {
			return n.toFixed(0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}
		return n
	}

	function formatPct(n) {
		if (typeof n === "number") {
			n = n*100;
			return n.toFixed(1).toString().concat('%');
		}
		return n
	}



	// ####################################
	// ####################################
	// ##
	// ##  BUILD MAP
	// ## 
	// ####################################
	// ####################################


	function buildMap(data) {
		// make copy so we're not editing the master dataset
		dataCopy = jQuery.extend(true, {}, data);

		map.selectAll("*").remove();

		var i,j;
		var allMerges = [];

		// Remove any munis to be merged from the dataCopy object
		// (they will be drawn in a different routine after the normal one)
		if ( merges.length > 0 ) {
			// Compile a one-dimensional list of all munis to be merged
			for (i=0; i<merges.length; i++) {
				for (j=0; j<merges[i]["munis"].length; j++) {
					allMerges.push(merges[i]["munis"][j]);
				}
			}
			// reset variables
			i=0, j=0;
			// iterate over munis and check which ones need to be merged
			for (i=dataCopy.objects.municipalities.geometries.length - 1 ; i>=0; i--) {
				var thisPlaceFp = dataCopy.objects.municipalities.geometries[i].properties.placefp;
				// if this muni is in the allMerges list, then remove it from the dataCopy object
				if ( allMerges.indexOf(thisPlaceFp) > -1) {
					dataCopy.objects.municipalities.geometries.splice(i,1)
				}
			}

		}

		// Draw share message if user clicked a share link to get here
		if (merges.length > 0 && shared == true) {
			$('#map-message').html('Your friend created a new St. Louis. <br/>Click "reset" to start making your own!');
		}
		// Otherwise, turn on share button if we have merged munis
		else if (merges.length > 0) {
			$('#map-share').prop("disabled",false);
		}
		// Or, if no merged munis, turn share button off.
		else {
			$('#map-share').prop("disabled",true);
		}

		// Draw the municipality polygons
		map.selectAll("path")
			.data(topojson.feature(dataCopy, dataCopy.objects.municipalities).features)
			.enter()
			.append("path")
			.attr("class", "muni")
			.attr("data-name", function(d) { return d.properties.name; })
			.attr("data-placefp", function(d) { return d.properties.placefp; })
			.attr("data-population", function(d) { 
				return formatCommas( stats[d.properties.placefp]["pop-total"] ); 
			})
			.attr("data-income", function(d) { 
				return formatMoney( stats[d.properties.placefp]["per-capita-income"] );
			})
			.attr("data-pct-white", function(d) { 
				return formatPct( 
					stats[d.properties.placefp]["pop-white"] / stats[d.properties.placefp]["pop-total"] 
				);
			})
			.attr("data-pct-black", function(d) { 
				return formatPct( 
					stats[d.properties.placefp]["pop-black"] / stats[d.properties.placefp]["pop-total"] 
				);
			})
			.attr("data-pct-asian", function(d) { 
				return formatPct( 
					stats[d.properties.placefp]["pop-asian"] / stats[d.properties.placefp]["pop-total"] 
				);
			})
			.attr("data-pct-other", function(d) { 
				return formatPct( 
					stats[d.properties.placefp]["pop-other"] / stats[d.properties.placefp]["pop-total"] 
				);
			})
			.attr("d", path)
			// click handler
			.on("click", muniOnClick);



		// reset variables
		i=0, j=0;

		// Draw any merged municipalities
		if (merges.length > 0) {
			// Iterate over each mergeSet
			for (i=0; i<merges.length; i++) {
				var mergeSet = merges[i]["munis"];
				var mergeName = merges[i]["name"];
				var mergePlaceFp = merges[i]["placefp"];

				// calculate new stats for merged municipality
				var popTotal=0, popWhite=0, popBlack=0, popAsian=0, popOther=0, income=0;
				// track if this is unincorporated
				var uninc = false;
				for (j=0; j<mergeSet.length; j++) {
					popTotal += stats[ mergeSet[j] ]['pop-total'];
					popWhite += stats[ mergeSet[j] ]['pop-white'];
					popBlack += stats[ mergeSet[j] ]['pop-black'];
					popAsian += stats[ mergeSet[j] ]['pop-asian'];
					popOther += stats[ mergeSet[j] ]['pop-other'];
					income += ( stats[ mergeSet[j] ]['per-capita-income'] * stats[ mergeSet[j] ]['pop-total']);
				}
				var mergeClass = 'muni merged';

				// Iterate over MASTER topojson, find all munis from this mergeset, and draw them as one polygon
				map.append("path")
					.datum(topojson.merge(data, data.objects.municipalities.geometries.filter(function(d) { return mergeSet.indexOf(d.properties.placefp) > -1; })))
					.attr("class", mergeClass)
					.attr("merge-id", i.toString() )
					.attr("data-name", mergeName)
					.attr("data-placefp", mergePlaceFp)
					.attr("data-population", function(d) { return formatCommas( popTotal ); })
					.attr("data-income", function(d) { return formatMoney( income / popTotal ); })
					.attr("data-pct-white", function(d) { return formatPct( popWhite / popTotal ); })
					.attr("data-pct-black", function(d) { return formatPct( popBlack / popTotal ); })
					.attr("data-pct-asian", function(d) { return formatPct( popAsian / popTotal ); })
					.attr("data-pct-other", function(d) { return formatPct( popOther / popTotal ); })
					.attr("d", path)
					// click handler
					.on("click", muniOnClick);
			}
		}


		// Draw the municipalities' borders
		map.append("path")
			.datum(topojson.mesh(dataCopy, dataCopy.objects.municipalities, function(a,b) { return a != b; }))
			.attr("class", "muni-boundary")
			.attr("d", path);


		// Display municipality's info
		var timer;

		// OnMouseEnter handler
		$('path.muni').on("mouseenter", function() {
			// if we immediately re-enter, cancel the timer so the stats box
			// doesn't get 'inactive' class. This avoids flickering effect.
			clearTimeout(timer);
	
			// Empty out the spans which contain data
			resetStats();
			// Populate the spans with this specific muni's data
			$("#stats-name span").text( $(this).attr("data-name") );
			$("#stats-population span").text( $(this).attr("data-population") );
			$("#stats-pct-white span").text( $(this).attr("data-pct-white") );
			$("#stats-pct-black span").text( $(this).attr("data-pct-black") );
			$("#stats-pct-asian span").text( $(this).attr("data-pct-asian") );
			$("#stats-pct-other span").text( $(this).attr("data-pct-other") );
			$("#stats-income span").text( $(this).attr("data-income") );
			$('#map-stats').removeClass('inactive');
		});

		// OnMouseLeave handler
		$('path.muni').on("mouseleave", function() {
			// Empty out the spans which contain data
			resetStats();
			// Add an inactive class to hide the stats box. We're using timeout
			// to slightly delay this. If the user mouses over another muni
			// then we will cancel the hiding, in order to avoid flicker.
			timer = setTimeout(function() {
				$('#map-stats').addClass('inactive');
			}, 50);
		});

	}



	// ####################################
	// ####################################
	// ##
	// ##  MUNI CLICK HANDLER
	// ## 
	// ####################################
	// ####################################


	function muniOnClick(d) {
		// this = the svg shape on the canvas, which includes all the data-* attributes
		// d = D3 data element
		// d is fine for single munis, but useless for MERGED munis, because all properties are lost.
		// So, use this instead.

		// Check if this element was already selected
		var thisPlaceFp = this.getAttribute('data-placefp');
		var thisIndex = selected.indexOf(this);

		// If it was already selected, then let's remove it from the array
		if ( thisIndex >= 0) {
			selected.splice(thisIndex, 1);
		}
		// Otherwise, add it to the array
		else {
			selected.push(this);
		}
		// If we have one or munis selected, activate the control panel
		if (selected.length > 0) {
			$("#muni-controls").removeClass("inactive");
			// If MULTIPLE munis are selected ...
			if (selected.length > 1) {
				// ... turn on "MERGE" button
				$("#map-merge").prop("disabled",false);
				// ... turn off "SPLIT" button
				$("#map-split").prop("disabled",true);
			}
			// If ONLY ONE muni is selected ...
			else {
				// ... turn off "MERGE" button
				$("#map-merge").prop("disabled",true);
				// if this is a mergeset, turn on "SPLIT" button
				if ( allPlaceFps.indexOf(thisPlaceFp) == -1 ) {
					$("#map-split").prop("disabled",false);
				}
			}
		}
		// If no munis are selected, disable the control panel
		else {
			resetControls();
		}

		resetSelections();

		// I'm running selectAll on a clone of select, rather than on select itself.
		// The reason is that d3 seems to pollute the select array with a "parentNode: false"
		// element. I don't understand how/why this gets added, but I figured better to
		// avoid it creeping into the select array itself.
		var selectedCopy = selected.slice(0);
		d3.selectAll(selectedCopy).classed("active", true);
	}


	function resetSelections() {
		d3.selectAll(".muni").classed("active",false);
	}

	function resetControls() {
		$("#muni-controls").addClass("inactive");
		$("#map-merge").prop("disabled",true);
		$("#map-split").prop("disabled",true);
	}

	function resetMessage() {
		$('#map-message').empty();
		shared = false;
	}

	function resetStats() {
		$('#map-stats').children('div span').each(function(){
			$(this).empty();
		});
	}




})(); //app closure










