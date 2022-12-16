const fs = require("fs");
const { XMLParser, XMLBuilder, XMLValidator} = require("fast-xml-parser");
var CRC32 = require('crc-32');
const items = [ "ItemIronOre", "ItemSiliconOre", "ItemSilverOre", "ItemCoalOre", "ItemDirtyOre", "ItemCopperOre", "ItemGoldOre"
  , "ItemIronIngot", "ItemCopperIngot", "ItemGoldIngot", "ItemLeadIngot", "ItemNickelIngot", "ItemSiliconIngot", "ItemSilverIngot"
  , "ItemBeacon"
  , "ItemFlagSmall"
  , "ItemKitWall"
  , "ItemKitWallIron"
  , "ItemPipeValve"
  , "ItemSprayCanGreen", "ItemSprayCanBlue"
  , "ItemSteelFrames"
  , "ItemReagentMix"];
var hash_lookup = {};
var metrics = {};
var prefab_counts = {};
var child_list = {};
const http = require('node:http');

for (item of items) {
  hash_lookup[CRC32.str(item)] = item;
}

function lookup_hash(hash) {
  if (hash_lookup[hash]) return hash_lookup[hash] + "("+hash+")";
  else return hash;
}
function decompress(value) {
  var x = value + "";
  var len = x.length;
  var obj = {};
  obj.a = x.substr(0, len-5);
  obj.b = x.substr(len-5, 3);
  obj.c = x.substr(len-2, 2);
  return obj;
}

function metrics_increment(key, value) {
  if (metrics[key] == undefined) metrics[key] = value;
  else metric[key] += value;
}

function doit(worldxmo) {
  save = fs.readFileSync(worldxml, "ascii");

  parser = new XMLParser();
  doc = parser.parse(save);
  metrics = {};
  metrics["days_past"] = doc.WorldData.DaysPast;
  metrics["things"] = doc.WorldData.Things.ThingSaveData.length;
  prefab_counts = {};
  child_list = {};

  for (const thing of doc.WorldData.Things.ThingSaveData) {
    var hash = CRC32.str(thing.PrefabName);
    if (hash_lookup[hash] == undefined) {
      //console.log("found new hash", thing.PrefabName, hash);
      hash_lookup[hash] = thing.PrefabName;
    }
    if (child_list[thing.ParentReferenceId] == undefined) child_list[thing.ParentReferenceId] = [];
    child_list[thing.ParentReferenceId].push(thing);
  }
  for (const thing of doc.WorldData.Things.ThingSaveData) {
    if (prefab_counts[thing.PrefabName] == undefined) prefab_counts[thing.PrefabName] = 0;
    if (thing.Quantity) {
      prefab_counts[thing.PrefabName] += thing.Quantity;
    } else {
      prefab_counts[thing.PrefabName] += 1;
    }
    //if (thing.PrefabName == "StructureCombustionCentrifuge") {
    if (thing.Reagents != "") {
      var list;
      if (thing.Reagents.Reagent.TypeName != undefined) list = [thing.Reagents.Reagent];
      else list = thing.Reagents.Reagent;
      for (const reagent of list) {
        metrics_increment('reagent{prefab="' + thing.PrefabName + '",reagent="' + reagent.TypeName + '"}', reagent.Quantity);
      }
    }
    if (thing.PrefabName == "StructureSDBSilo") {
      // TODO, if list only has 1 element, its not a list!
      for (const child of thing.AllStoredItems) {
        //console.log(child.DynamicThing);
        if (prefab_counts[child.DynamicThing.PrefabName] == undefined) prefab_counts[child.DynamicThing.PrefabName] = 0;
        if (child.DynamicThing.Quantity) {
          prefab_counts[child.DynamicThing.PrefabName] += child.DynamicThing.Quantity;
        } else {
          prefab_counts[child.DynamicThing.PrefabName] += 1;
        }
      }
    }
    if (thing.PrefabName == "StructureVendingMachine") {
      metrics['vending_machine_item_count{name="'+thing.CustomName+'"}'] = child_list[thing.ReferenceId].length;
    }
    if (thing.PrefabName == "Fertilizer") {
      console.log("fert count",thing.Quantity, "cycles", thing.Cycles, "harvest boost", thing.HarvestBoost, "growth speed", thing.GrowthSpeed);
    }
    if (thing.PrefabName == "ItemIntegratedCircuit10") {
      if (thing.CustomName && (thing.CustomName.length > 0)) console.log(thing.CustomName);
      var expr = /^Prometheus (.*)$/;
      if (res = expr.exec(thing.CustomName)) {
        var name = res[1];
        for (var i=0; i<thing.Stack.length; i++) {
          metrics[name+"{index=\""+i+"\"}"] = thing.Stack[i];
        }
      }
      if (thing.CustomName == "Storage Master") {
        console.log("  R2/ClientCount == " + thing.Registers[2]);
        console.log("  R9/Stage == " + thing.Registers[9]);
        console.log(16, thing.Registers[16]);
        console.log(17, thing.Registers[17]);
        for (var i=0; i<100; i++) {
          var entry = thing.Stack[i];
          if (entry == 0) break;
          if (entry == undefined) break;
          var obj = decompress(entry);
          //console.log("  queue["+i+"] == " + obj.b + " * " + lookup_hash(obj.a) + " -> " + obj.c);
        }
      }
      if (/Router/.exec(thing.CustomName)) {
        console.log("  ID# " + thing.Registers[12]);
        for (var i=0; i<100; i++) {
          var entry = thing.Stack[i];
          if (entry == 0) break;
          //if (i == thing.Registers[9]) console.log("  rest are expired");
          var obj = decompress(entry);
          //console.log("  queue["+i+"] == " + obj.b + " * " + lookup_hash(obj.a) + " -> " + obj.c);
        }
        for (var i=0; i<5; i++) {
          var entry = thing.Stack[490+i];
          if (entry == undefined) break;
          //console.log("  d"+i+" is addr " + entry);
        }
      }
    }
  }
}

var worldxml = process.argv[2];
var oldmtime = 0;
function scan() {
  var stat = fs.statSync(worldxml);
  if (stat.mtimeMs != oldmtime) {
    console.log(stat.mtime);
    doit(worldxml);
  }
  oldmtime = stat.mtimeMs;
}
setInterval(scan, 5000);
scan();

const server = http.createServer((req, res) => {
  var lines = [];
  for (const metric in metrics) {
    lines.push(metric + " " + metrics[metric]);
  }
  for (const prefab in prefab_counts) {
    lines.push("item_count{prefab=\"" + prefab + "\"} " + prefab_counts[prefab]);
  }
  res.end(lines.join("\n"));
});

server.listen(8000);
