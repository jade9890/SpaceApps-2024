let embeddedMap;
let geocoder;
let currentOverlay;
let latlng = {lng: -83, lat: 42};

let evapChart;
var soilImage;
var soilMoistureCollection;
var moistRecentImage;
var evaporationCollection;
var evapRecentImage;

let evapArray = [[0,0]];
let moistArray = [[0,0]];
let soilcategory = 0;

// 0-2
let soiltier = -1;
let moisttier = -1;
let country;

function init() {
  soilImage = ee.Image('OpenLandMap/SOL/SOL_TEXTURE-CLASS_USDA-TT_M/v02');
  soilMoistureCollection = ee.ImageCollection('NASA/SMAP/SPL4SMGP/007');
  moistRecentImage = soilMoistureCollection
    .filterDate('2024-01-01', '2024-12-31')  // Adjust the date range as needed
      .sort('system:time_start', false)         // Sort by time, descending
      .first();                                 // Get the first image
  evaporationCollection = ee.ImageCollection("MODIS/061/MOD16A2GF");
  evapRecentImage = evaporationCollection
    .filterDate('2020-01-01', '2024-12-31')
    .sort('system:time_start', false)
    .first();
}


function showSoil() {
  const soilParams = {
    bands: ['b0'],
    min: 1,
    max: 12,
    opacity: 0.75,
    palette: [
      'd5c36b','b96947','9d3706','ae868f','f86714','46d143',
      '368f20','3e5a14','ffd557','fff72e','ff5a9d','ff005b',
    ]
  };
  
  // Get the map ID for the image and handle the response
  const mapId = soilImage.getMap(soilParams);
  const tileSource = new ee.layers.EarthEngineTileSource(mapId);
  const overlay = new ee.layers.ImageOverlay(tileSource);
  if (currentOverlay) {
    embeddedMap.overlayMapTypes.pop();  // Remove the previous overlay
  }
  
  // Set the new overlay as the current one
  currentOverlay = overlay;
  embeddedMap.overlayMapTypes.push(overlay);
}

function showMoisture() {
  
  // Set visualization parameters
  const moistureParams = {
    bands: ['specific_humidity_lowatmmodlay', 'sm_surface', 'sm_rootzone'],
    min: 0,
    max: 1,
    gamma: [15, 10, 5],
    opacity: 0.75,
  };
  
  // Get the map ID for the image and handle the response
  const mapId = moistRecentImage.getMap(moistureParams);
  const tileSource = new ee.layers.EarthEngineTileSource(mapId);
  const overlay = new ee.layers.ImageOverlay(tileSource);
  if (currentOverlay) {
    embeddedMap.overlayMapTypes.pop();  // Remove the previous overlay
  }

  // Set the new overlay as the current one
  currentOverlay = overlay;
  embeddedMap.overlayMapTypes.push(overlay);

}


function showEvaporation() {

  // Set visualization parameters
  const evaporationParams = {
    bands: ['PET', 'PLE', 'ET_QC'],
    min: 0,
    max: 500,
    gamma: [0.95, 1, 0.5],
    opacity: 0.75,
  };
  
  // Get the map ID for the image and handle the response
  const mapId = evapRecentImage.getMap(evaporationParams);
  const tileSource = new ee.layers.EarthEngineTileSource(mapId);
  const overlay = new ee.layers.ImageOverlay(tileSource);
  if (currentOverlay) {
    embeddedMap.overlayMapTypes.pop();  // Remove the previous overlay
  }

  // Set the new overlay as the current one
  currentOverlay = overlay;
  embeddedMap.overlayMapTypes.push(overlay);
}

function setUpMap() {
  init();
  // Hide the sign-in button.
  document.getElementById("g-sign-in").setAttribute("hidden", "true");

  // Initialize the Earth Engine API. Must be called once before using the API.
  ee.initialize();

  // Get a reference to the placeholder DOM element to contain the map.
  const mapContainer = document.getElementById("map");

  // Create an interactive map inside the placeholder DOM element.
  embeddedMap = new google.maps.Map(mapContainer, {
    // Pan and zoom initial map viewport to Grand Canyon.
    center: latlng,
    zoom: 9,
  });
  initAutocomplete();
  showEvaporation();

  geocoder = new google.maps.Geocoder();

  embeddedMap.addListener("click", (mapsMouseEvent) => {
    latlng = mapsMouseEvent.latLng.toJSON();
    geocode(latlng);
    updateChart();
  });

  google.charts.load('current', {'packages':['corechart']});
  google.charts.setOnLoadCallback(drawChart);
}

function initAutocomplete() {
  const input = document.getElementById("pac-input");
  const searchBox = new google.maps.places.SearchBox(input);

  embeddedMap.controls[google.maps.ControlPosition.TOP_LEFT].push(input);
  // Bias the SearchBox results towards current map's viewport.
  embeddedMap.addListener("bounds_changed", () => {
    searchBox.setBounds(embeddedMap.getBounds());
  });

  let markers = [];

  // Listen for the event fired when the user selects a prediction and retrieve
  // more details for that place.
  searchBox.addListener("places_changed", () => {
    const places = searchBox.getPlaces();

    if (places.length == 0) {
      return;
    }

    // Clear out the old markers.
    markers.forEach((marker) => {
      marker.setMap(null);
    });
    markers = [];

    // For each place, get the icon, name and location.
    const bounds = new google.maps.LatLngBounds();

    places.forEach((place) => {
      if (!place.geometry || !place.geometry.location) {
        console.log("Returned place contains no geometry");
        return;
      }

      // Create a marker for each place.
      markers.push(
        new google.maps.Marker({
          embeddedMap,
          title: place.name,
          position: place.geometry.location,
        }),
      );
      if (place.geometry.viewport) {
        // Only geocodes have viewport.
        bounds.union(place.geometry.viewport);
      } else {
        bounds.extend(place.geometry.location);
      }
    });
    embeddedMap.fitBounds(bounds);
  });
}

function geocode(latlng) {
  geocoder
    .geocode({location: latlng})
    .then((result) => {
      country = result.results[result.results.length-1].formatted_address;
    })
    .catch((e) => {
      alert("Geocode was not successful for the following reason: " + e);
    });
}

function updateChart() {
  const location = ee.Geometry.Point(latlng.lng, latlng.lat);
  const evapArea = evaporationCollection
    .filterDate('2020-01-01', '2024-12-31')
    .filterBounds(location)
    .select(['ET_QC']);

  evapArea.size().getInfo(function(size) {
    if (size === 0) {
      console.log("No images found for the specified date range and location.");
      return; // Exit if no images are found
    }

    // Map over the ImageCollection to reduce it to a time series
    const data = evapArea.map(function(image) {
      const mean = image.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: location,
        scale: 1000,
      });
      
      // Create a Feature with the mean value and time
      return ee.Feature(null, mean).set('system:time_start', image.get('system:time_start'));
    });

    // Convert to a FeatureCollection
    const featureCollection = ee.FeatureCollection(data);
    featureCollection.getInfo(function(features) {
      if (!features || !features.features) {
        console.log("No features returned.");
        return; // Exit if features are not present
      }

      // Create a 2D array for storing the results
      const rows = features.features.map(function(f) {
        const time = f.properties['system:time_start'];
        const etValue = f.properties['ET_QC'] || null; // Handle potential undefined values
        return (etValue)? [new Date(time), etValue] : null; // Create a row with time and ET_QC value
      });

      evapArray = rows.filter(n => n);
    
    });
  });


  const mean = soilImage.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: location,
    scale: 1000,
  });
  const coll = ee.FeatureCollection(ee.Feature(null, mean).set('system:time_start', soilImage.get('system:time_start')));
  coll.getInfo(function(features) {
    if (!features || !features.features) {
      console.log("No features returned (soil).");
      return; // Exit if features are not present
    }

    // Create a 2D array for storing the results
    const rows = features.features.map(function(f) {
       return f.properties['b0'] || null; // Handle potential undefined values
      });

    soilcategory = rows[0];
  });

  const moistArea = soilMoistureCollection
    .filterDate('2024-09-15', '2024-10-06')
    .filterBounds(location)
    .select(['sm_surface']);

  moistArea.size().getInfo(function(size) {
    if (size === 0) {
      console.log("No images found for the specified date range and location.");
      return; // Exit if no images are found
    }

    // Map over the ImageCollection to reduce it to a time series
    const data = moistArea.map(function(image) {
      const mean = image.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: location,
        scale: 100,
      });

      // Create a Feature with the mean value and time
      return ee.Feature(null, mean).set('system:time_start', image.get('system:time_start'));
    });

    // Convert to a FeatureCollection
    const featureCollection = ee.FeatureCollection(data);
    featureCollection.getInfo(function(features) {
      if (!features || !features.features) {
        console.log("No features returned (soil mmoisture).");
        return; // Exit if features are not present
      }

      // Create a 2D array for storing the results
      const rows = features.features.map(function(f) {
        const time = f.properties['system:time_start'];
        const smValue = f.properties['sm_surface'] || null; // Handle potential undefined values
        return (smValue)? [new Date(time), smValue] : null; // Create a row with time and ET_QC value
      });

      moistArray = rows.filter(n => n);
    
      drawChart();
    });
  });

}

function drawChart() {
  
  const moistTable = google.visualization.arrayToDataTable([
    ['Date', 'Moisture'], // Adjust column names based on your data
    ...moistArray
  ]);

  var options = {
    title: 'Moisture over time',
    curveType: 'function',
    legend: { position: 'bottom' },
  };
  
  var moistChart = new google.visualization.LineChart(document.getElementById('moist_chart'));
  
  moistChart.draw(moistTable, options);

  const evapTable = google.visualization.arrayToDataTable([
    ['Date', 'Evaporation'], // Adjust column names based on your data
    ...evapArray
  ]);

  var options = {
    title: 'Evaporation over time',
    curveType: 'function',
    legend: { position: 'bottom' },
  };
  
  var evapChart = new google.visualization.LineChart(document.getElementById('evap_chart'));
  
  evapChart.draw(evapTable, options);


  let moistureIndex = evapArray[evapArray.length-1][1] * moistArray[moistArray.length-1][1] * moistArray[moistArray.length-1][1];
  if (moistureIndex > 6.5) {
    moisttier = 0;
  } else if (moistureIndex > 2.1) {
    moisttier = 1;
  } else {
    moisttier = 2;
  }
  if (soilcategory > 6.5) {
    soiltier = 0;
  } else if (soilcategory > 2.1) {
    soiltier = 1;
  } else {
    soiltier = 2;
  }
};

function changeMap(mode) {
  if (mode == 0) {
    showSoil()
  } else if (mode ==1) {
    showMoisture();
  } else {
    showEvaporation();
  }
}

// Handles clicks on the sign-in button.
function onSignInButtonClick() {
  // Display popup allowing the user to sign in with their Google account and to
  // grant appropriate permissions to the app.
  ee.data.authenticateViaPopup(setUpMap);
}

// If the user is signed in, display a popup requesting permissions needed to
// run the app, otherwise show the sign-in button.
ee.data.authenticateViaOauth(
  '425766528478-pg98n80vsbhka2lbadhtchoho2u7ji8v.apps.googleusercontent.com',
  setUpMap,
  alert,
  ['https://www.googleapis.com/auth/earthengine.readonly'],
  () => console.log("Sign-in successful"),
  true
);

window.initAutocomplete = initAutocomplete;