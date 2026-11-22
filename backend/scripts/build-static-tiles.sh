#!/usr/bin/env bash
# Builds frontend/public/tiles/<layer>.pmtiles from the FULL database (with all attributes),
# for the layers listed in frontend/src/config/static-tiles.js.
# Needs: ogr2ogr (GDAL) and tippecanoe >= 2.17. Linux/macOS/WSL.
#   PGCONN="host=localhost port=5432 user=postgres dbname=investmap" ./scripts/build-static-tiles.sh
set -euo pipefail
: "${PGCONN:?set PGCONN, e.g. host=localhost dbname=investmap user=postgres}"
OUT="$(cd "$(dirname "$0")/../../frontend/public" && pwd)/tiles"
TMP="$(mktemp -d)"; mkdir -p "$OUT"

build() { # table minzoom [select-list]
  local t=$1 z=$2 cols=${3:-*}
  ogr2ogr -f GeoJSONSeq "$TMP/$t.geojsons" PG:"$PGCONN" -sql "SELECT $cols FROM $t" -lco RS=NO -lco COORDINATE_PRECISION=7
  tippecanoe -q -o "$OUT/$t.pmtiles" -l data -Z"$z" -z14 -pk -pf --force --read-parallel -P "$TMP/$t.geojsons"
  rm -f "$TMP/$t.geojsons"; echo "$t $(du -h "$OUT/$t.pmtiles" | cut -f1)"
}

for spec in assembly_boundary:0 parliament_boundary:0 ncr_district:0 habitation_area:12 rapid_metro_line:10 \
  delhi_metro_line:10 proposed_metro_line:10 ioc_gas_line:13 women_line:13 sec_ug_electric_line:13 bus_bar:14 \
  switching_facility:14 sewerage_line:13 pri_ug_electric_segment:13 eht_feeder:13 sewerage_point:13 open_point:14 \
  switch:14 joint:14 distribution_transformer:14; do
  build "${spec%%:*}" "${spec##*:}"
done

# The two overhead line layers keep the fields people read (feeder, division, conductor,
# voltage, length...) and drop internal link IDs, duplicate coordinates and audit fields,
# which would otherwise make each file ~230 MB.
LINE_COLS="geom, id, feederid, divisionname, subdivisionname, substationcode, towncode, conductorconfiguration, conductorname_r, conductorname_y, conductorname_b, conductormaterial_r, conductorsize, conductortype_r, insulationtype, nominalvoltage, operatingvoltage, noofwires, phasedesignation, neutral, guarding, round(measuredlength::numeric,1) AS measuredlength, constructionstatus, feed_cat, installationcompany, remarks"
build sec_oh_electric_line 13 "$LINE_COLS, neutralsize"
build pri_oh_electric_line 13 "$LINE_COLS, feedercategory, phaseorientation"
rm -rf "$TMP"
