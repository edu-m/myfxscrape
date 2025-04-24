<?php

function process_har_to_csv($filename)
{
    $raw_json = file_get_contents($filename);
    $output = fopen("./csv/" . substr($filename, 0, -4) . ".csv", "w") or die("Unable to open file!");
    fwrite($output, "Close Date,Change%\n");
    $json = json_decode($raw_json, true)["log"]["entries"];
    $found = false;
    for ($i = count($json) - 1; $i >= 0 && !$found; $i--)
        if (str_contains(json_encode($json[$i]["response"]["content"]), "Equity Growth")) {
            $found = true;
            $json = $json[$i]["response"]["content"];
        }
    if (!$found) {
        print ("No data found in $filename. Skipping.\n");
        return 0;
    }
    $inner_json = json_decode($json["text"], true);
    $keys = $inner_json["categories"];
    $values = $inner_json["series"][1]["data"]; // 0 is Equity Growth, 1 is Balance Growth
    $offset = 0;
    for ($i = 0; $i < count($keys); $i++) {
        $v = $values[$i - $offset];
        if ($i != $v[0]) {
            // if there is a date, there isn't necessarily a datapoint to go with.
            // Sometimes deposits or withdrawals create a date in the list, but it's empty
            // creating an offset in the ordering of the datapoints,
            // so we account for that from that point on
            $offset++;
            continue;
        }
        $dataset[$keys[$i]] = $v[1];
        assert($i == $v[0]);
    }

    foreach ($dataset as $key => $value) {
        $date = DateTime::createFromFormat("M d, 'y", $key);
        $line = $date->format('m/d/Y') . "," . $value . "\n";
        fwrite($output, $line);
    }
    print ("Processed " . $filename . " successfully.\n");
    fclose($output);
    return 1;
}

function process_all_hars()
{
    $files = glob("*.har");
    $n_files = count($files);
    $n_success = 0;
    if (!$files)
        die("Found no HAR files on current directory!");
    else
        foreach ($files as $file)
            $n_success += process_har_to_csv($file);
    if ($n_success == 0)
        return 0;
    if ($n_success < $n_files)
        return 1;
    else
        return 2;
}

$status = process_all_hars();
$responses = array(
    "Error: No HAR files could be processed.",
    "Warning: Process terminated with some errors.",
    "Success: Process terminated with no errors."
);

print ("\n" . $responses[$status] . "\n");