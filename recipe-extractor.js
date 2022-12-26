const { XMLParser, XMLBuilder, XMLValidator} = require("fast-xml-parser");
const fs = require("fs");

var recipes = {};

function parseRecipes(file) {
  var contents = fs.readFileSync(file, "ascii");
  parser = new XMLParser();
  const doc = parser.parse(contents);
  for (const printer in doc.GameData) {
    const recipeList = doc.GameData[printer].RecipeData;
    for (const recipe of recipeList) {
      console.log(`${recipe.PrefabName} is made with`);
      var cost = {};
      for (const ingot in recipe.Recipe) {
        const quant = recipe.Recipe[ingot];
        if (quant > 0) {
          console.log(`${quant} x ${ingot}`);
          cost[`Item${ingot}Ingot`] = quant;
        }
      }
      recipes[recipe.PrefabName] = [ cost ];
    }
  }
}

var files = [ "autolathe.xml", "electronics.xml", "PipeBender.xml", "toolmanufacturer.xml", "security.xml" ];
var dir = process.argv[2];
for (const f of files) {
  parseRecipes(`${dir}/${f}`);
}
fs.writeFileSync("recipes.json", JSON.stringify(recipes, null, 2));
