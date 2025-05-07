<?php
// client-send-csv-files.php

// Define the secret key that must match the one in your WordPress plugin.
$secretKey = 'e190600055aa93dac66ce383c4924d8fc6c5b9a049c1a355a97c14c6bc9f941e';

// Define the local directory where the CSV files are stored.
$csvDirectory = './csv/';

// Initialize the data array with the secret key.
$data = array(
    'secret_key' => $secretKey,
    'files'      => array()
);

// Get all CSV files in the specified directory.
$csvFiles = glob($csvDirectory . '*.csv');

if ($csvFiles === false || empty($csvFiles)) {
    die("No CSV files found in the folder: $csvDirectory");
}

// Loop through each CSV file.
foreach ($csvFiles as $csvFile) {
    // Read the contents of the file.
    $content = file_get_contents($csvFile);
    if ($content === false || filesize($csvFile) <= 19) {
        echo "File doesn't exist or has not been populated: $csvFile\n";
        continue;
    }
    
    // Determine the target path on the WordPress server.
    // Here, we use the same filename and assume that the target directory is wp-content/uploads/.
    $targetPath = 'wp-content/uploads/scrape_data/' . basename($csvFile);
    
    // Append this file's data to the files array.
    $data['files'][] = array(
        'path'    => $targetPath,
        'content' => $content
    );
}

// Encode the data array as JSON.
$jsonData = json_encode($data, JSON_PRETTY_PRINT);

// Set the URL to your WordPress REST endpoint.

$url = 'https://amicobot.it/wp-json/myfxscraper/v1/update-files';

// Initialize cURL.
$ch = curl_init($url);

// Set cURL options to send a POST request with the JSON payload.
// curl_setopt ($ch, CURLOPT_CAINFO, getcwd().'\cacert.pem');
// curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "POST");
curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonData);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
    'Content-Type: application/json',
    'Content-Length: ' . strlen($jsonData)
));

// Execute the cURL request.
$result = curl_exec($ch);

// Check for errors.
if (curl_errno($ch)) {
    echo 'Error: ' . curl_error($ch);
} else {
    echo "Server response:\n" . $result;
}

// Close the cURL session.
curl_close($ch);
?>
