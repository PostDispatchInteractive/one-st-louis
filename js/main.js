// using a closure to protect global variables
(function () {

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
	deletes, 
	active, 
	munis, 
	stats;



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
		deletes = [];

		active = d3.select(null);
		munis;


		// Load the map's geopgraphy into D3
		d3.json("data/municipalities.topojson", function(error, data) {

			// clone and store the data in a global variable so we can access it later
			munis = jQuery.extend(true, {}, data);

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


		// Map control click handlers
		$("#map-merge").on("click", function() {
			// Pop up box to ask user to name their new merged muni
			var bPopup = $('#merge-name-popup').bPopup({
				// After they submit the form 
				onClose: function() {
					console.log('FIRING!');
					// Store user's submitted name
					var newName = $('#merge-name-popup input').val();
					// If they didn't submit anything, use generic label
					if ( !newName.trim() > '' ) {
						newName = 'Merged municipality'
					}
					// empty the name field so it can be re-used later.
					$('#merge-name-popup input').val('');
					// Build the merge set
					var mergeSet = {};
					mergeSet["name"] = newName;
					mergeSet["munis"] = [];
					for (var i=0; i<selected.length; i++) {
						mergeSet["munis"].push( $(selected[i]).attr('data-placefp') );
					}
					// Append the merge set to our master list of mergesets
					merges.push(mergeSet);
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

		$("#map-delete").on("click", function() {
			for (var i=0; i<selected.length; i++) {
				deletes.push( $(selected[i]).attr('data-placefp') );
			}
			resetControls();
			selected.length = 0; // empty the selected array
			buildMap(munis);
		}); // end map-delete click handler 

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

		// Only run this routine if we have merges
		if ( merges.length > 0 ) {
			// Compile a one-dimensional list of all munis to be merged
			for (i=0; i<merges.length; i++) {
				for (j=0; j<merges[i]["munis"].length; j++) {
					allMerges.push(merges[i]["munis"][j]);
				}
			}
		}

		// reset variables
		i=0, j=0;

		// Only run this routine if we have deletes or merges
		if ( deletes.length > 0 || merges.length > 0) {
			// iterate over munis and check which ones need to be deleted or merged
			for (i=dataCopy.objects.municipalities.geometries.length - 1 ; i>=0; i--) {
				var thisPlaceFp = dataCopy.objects.municipalities.geometries[i].properties.placefp;
				// if this muni is in the delete list, then remove it from the dataCopy object
				if ( deletes.indexOf(thisPlaceFp) > -1) {
					dataCopy.objects.municipalities.geometries.splice(i,1)
				}
				// if this muni is in the allMerges list, then remove it from the dataCopy object
				if ( allMerges.indexOf(thisPlaceFp) > -1) {
					dataCopy.objects.municipalities.geometries.splice(i,1)
				}
			}
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

				// calculate new stats for merged municipality
				var popTotal=0, popWhite=0, popBlack=0, popAsian=0, popOther=0, income=0;
				for (j=0; j<mergeSet.length; j++) {
					popTotal += stats[ mergeSet[j] ]['pop-total'];
					popWhite += stats[ mergeSet[j] ]['pop-white'];
					popBlack += stats[ mergeSet[j] ]['pop-black'];
					popAsian += stats[ mergeSet[j] ]['pop-asian'];
					popOther += stats[ mergeSet[j] ]['pop-other'];
					income += ( stats[ mergeSet[j] ]['per-capita-income'] * stats[ mergeSet[j] ]['pop-total']);
				}

				// Iterate over MASTER topojson, find all munis from this mergeset, and draw them as one polygon
				map.append("path")
					.datum(topojson.merge(data, data.objects.municipalities.geometries.filter(function(d) { return mergeSet.indexOf(d.properties.placefp) > -1; })))
					.attr("class", "muni merged")
					.attr("merge-id", i.toString() )
					.attr("data-name", mergeName)
					.attr("data-population", function(d) { return formatCommas( popTotal ); })
					.attr("data-income", function(d) { return formatMoney( income / popTotal ); })
					.attr("data-pct-white", function(d) { return formatPct( popWhite / popTotal ); })
					.attr("data-pct-black", function(d) { return formatPct( popBlack / popTotal ); })
					.attr("data-pct-asian", function(d) { return formatPct( popAsian / popTotal ); })
					.attr("data-pct-other", function(d) { return formatPct( popOther / popTotal ); })
					.attr("d", path);
			}
		}


		// Draw the municipalities' borders
		map.append("path")
			.datum(topojson.mesh(dataCopy, dataCopy.objects.municipalities, function(a, b) { return a !== b; }))
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
		// Check if this element was already selected
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
			$("#map-controls").removeClass("inactive");
			$("#map-delete").prop("disabled",false);
			// If MULTIPLE munis are selected ...
			if (selected.length > 1) {
				// ... turn on "MERGE" button
				$("#map-merge").prop("disabled",false);
			}
			// If ONLY ONE muni is selected ...
			else {
				// ... turn off "MERGE" button
				$("#map-merge").prop("disabled",true);
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
		$("#map-controls").addClass("inactive");
		$("#map-merge").prop("disabled",true);
		$("#map-delete").prop("disabled",true);
	}

	function resetStats() {
		$('#map-stats').children('div span').each(function(){
			$(this).empty();
		});
	}

	// If the drag behavior prevents the default click,
	// also stop propagation so we don’t click-to-zoom.
	// function stopped() {
	//	 if (d3.event.defaultPrevented) d3.event.stopPropagation();
	// }




})(); //app closure










