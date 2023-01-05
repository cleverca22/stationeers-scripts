const { XMLParser, XMLBuilder, XMLValidator} = require("fast-xml-parser");
const fs = require("fs");
var items = JSON.parse(fs.readFileSync("itemlist.json"));

var recipes = {};

function parseRecipes(file) {
  var contents = fs.readFileSync(file, "ascii");
  parser = new XMLParser();
  const doc = parser.parse(contents);
  for (const printer in doc.GameData) {
    const recipeList = doc.GameData[printer].RecipeData;
    for (const recipe of recipeList) {
      console.log(`${recipe.PrefabName} is made with`);
      if (items.indexOf(recipe.PrefabName) == -1) items.push(recipe.PrefabName);
      var cost = {};
      for (const ingot in recipe.Recipe) {
        const quant = recipe.Recipe[ingot];
        if (quant > 0) {
          if (ingot == "Energy") continue;
          if (ingot == "Time") continue;
          console.log(`${quant} x ${ingot}`);
          var itemname;
          if (ingot == "Cobalt") itemname = "ItemCobaltOre";
          else if (ingot == "Flour") itemname = "ItemFlour";
          else itemname = `Item${ingot}Ingot`;
          cost[itemname] = quant;
        }
      }
      if (recipes[recipe.PrefabName] == undefined) recipes[recipe.PrefabName] = [];
      recipes[recipe.PrefabName].push(cost);
    }
  }
}

var files = [ "advancedfurnace.xml", "autolathe.xml", "electronics.xml", "PipeBender.xml", "toolmanufacturer.xml", "security.xml", "automatedoven.xml" ];
var dir = process.argv[2];
for (const f of files) {
  parseRecipes(`${dir}/${f}`);
}
fs.writeFileSync("recipes.json", JSON.stringify(recipes, null, 2));

items = items.sort();
fs.writeFileSync("itemlist.json", JSON.stringify(items, null, 2));
