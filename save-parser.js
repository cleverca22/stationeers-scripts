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
var child_list = {};
var reference_lut = {};
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
  if (typeof(value) == "string") value = parseFloat(value);
  if (metrics[key] == undefined) metrics[key] = value;
  else metrics[key] += value;
}

function totalmols(atmos) {
  return atmos.Oxygen + atmos.Nitrogen + atmos.CarbonDioxide + atmos.Volatiles + atmos.Chlorine + atmos.Water + atmos.NitrousOxide;
}

function add_metric(name, params, value) {
  var l = [];
  for (const key in params) {
    l.push(key + '="' + params[key] + '"');
  }
  if (l.length) {
    metrics_increment(name + "{" + l.join(",") + "}", value);
  } else {
    metrics_increment(name, value);
  }
}

function doit(worldxmo) {
  save = fs.readFileSync(worldxml, "ascii");

  parser = new XMLParser();
  doc = parser.parse(save);
  metrics = {};
  metrics["days_past"] = doc.WorldData.DaysPast;
  metrics["things"] = doc.WorldData.Things.ThingSaveData.length;
  child_list = {};
  reference_lut = {};

  var graph = [];
  graph.push("digraph {");

  for (const thing of doc.WorldData.Things.ThingSaveData) {
    var hash = CRC32.str(thing.PrefabName);
    if (hash_lookup[hash] == undefined) {
      //console.log("found new hash", thing.PrefabName, hash);
      hash_lookup[hash] = thing.PrefabName;
    }
    if (child_list[thing.ParentReferenceId] == undefined) child_list[thing.ParentReferenceId] = [];
    child_list[thing.ParentReferenceId].push(thing);
    reference_lut[thing.ReferenceId] = thing;
    if (thing.ParentReferenceId) graph.push(thing.ParentReferenceId + " -> " + thing.ReferenceId);
  }
  for (const thing of doc.WorldData.Things.ThingSaveData) {
    if (thing.Quantity) {
      add_metric("item_count", { prefab: thing.PrefabName }, thing.Quantity);
    } else {
      add_metric("item_count", { prefab: thing.PrefabName }, 1);
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
      if (thing.AllStoredItems != undefined) {
        // TODO, if list only has 1 element, its not a list!
        for (const child of thing.AllStoredItems) {
          //console.log(child.DynamicThing);
          if (child.DynamicThing.Quantity) {
            add_metric("item_count", { prefab: child.DynamicThing.PrefabName }, child.DynamicThing.Quantity);
          } else {
            add_metric("item_count", { prefab: child.DynamicThing.PrefabName }, 1);
          }
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
      var housing = reference_lut[thing.ParentReferenceId];
      //console.log("housing", housing.PrefabName, housing.DeviceIDs);
      if (housing.DeviceIDs) {
        for (var i=0; i<6; i++) {
          var id = housing.DeviceIDs[i];
          if (id) {
            var device = reference_lut[housing.DeviceIDs[i]];
            //if (device) console.log("d"+i, device.PrefabName);
          }
        }
      }
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
  graph.push("}");
  // example of creating a graph of all IC10 stuff
  //fs.writeFileSync("connections.dot", graph.join("\n"));
  for (const atmos of doc.WorldData.Atmospheres.AtmosphereSaveData) {
    if (atmos.ThingReferenceId) {
      var parrent = reference_lut[atmos.ThingReferenceId];
      var mols = totalmols(atmos);
      if (mols > 0) {
        add_metric("mols", { PrefabName: parrent.PrefabName, element: "Oxygen" }, atmos.Oxygen);
        add_metric("mols", { PrefabName: parrent.PrefabName, element: "Volatiles" }, atmos.Volatiles);
        add_metric("energy", { PrefabName: parrent.PrefabName }, atmos.Energy);
      }
    } else if ((atmos.Position.x == -19) && (atmos.Position.z == -77)) {
      //console.log(atmos);
      add_metric("cube_energy", {}, atmos.Energy);
    } else if (atmos.Volume == 8000) { // a cube
    } else if (atmos.NetworkReferenceId) { // a pipe network
      if (atmos.Water) add_metric("pipe_mols", { NetworkReferenceId: atmos.NetworkReferenceId, element: "Water" }, atmos.Water);
    } else {
    }
  }
  for (const trader of doc.WorldData.StationContacts.StationContactData) {
    console.log(trader.ContactName, trader.ContactType, trader.Lifetime, trader.Angle);
    //console.log(Math.atan2(trader.Angle.x, trader.Angle.z));
    //console.log(Math.atan2(trader.Angle.x, trader.Angle.y));
    add_metric("trader_lifetime", { name: trader.ContactName, ref: trader.ReferenceId }, trader.Lifetime);
    for (const item of trader.TradeItemData.TradingItemDat) {
      var prefab = item.PrefabHash;
      if (hash_lookup[prefab]) prefab = hash_lookup[prefab];
      console.log("  ", prefab, "value", item.TradeValue, "max quant", item.MaxQuantity, "quant to purchase", item.QuantityToPurchase);
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
  console.log(new Date(), "poll");
  var lines = [];
  for (const metric in metrics) {
    lines.push(metric + " " + metrics[metric]);
  }
  res.end(lines.join("\n"));
});

var port = 8000;
if (process.argv.length > 3) port = parseInt(process.argv[3]);
server.listen(port);
