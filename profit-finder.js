const fs = require("fs");

const recipes = JSON.parse(fs.readFileSync("recipes.json"));
const items = JSON.parse(fs.readFileSync("itemlist.json"));
const prices = JSON.parse(fs.readFileSync("prices.json"));

var results = {};

for (const name of items) {
  results[name] = { cost: null };
}

for (const name in prices) {
  const price = prices[name];
  results[name].cost = price;
  results[name].tradeCost = price;
}

for (const name in recipes) {
  const recipeList = recipes[name];
  // for each recipe
  for (const recipe of recipeList) {
    var totalcost = 0;
    var debug = false;
    // for each ingredient in this recipe
    for (const item in recipe) {
      if (item == "debug") continue;
      const quant = recipe[item];
      const matcost = results[item].cost * quant;
      if (recipe.debug || (matcost == 0)) {
        console.log(`  ${quant} x ${item} costs ${matcost}`)
        debug = true;
      }
      totalcost += matcost;
    }
    if (debug) console.log(`1 ${name} can be made for ${totalcost}`);
    if (results[name] == undefined) results[name] = {};
    results[name].craftcost = totalcost;
    if (results[name].cost) {
      if (results[name].craftcost < results[name].cost) {
        results[name].cost = results[name].craftcost;
      }
    } else {
      results[name].cost = results[name].craftcost;
    }
  }
}

for (const name in results) {
  if (results[name].cost) {
    //console.log(name, results[name]);
    if (results[name].craftcost < results[name].tradeCost) {
      console.log(`profit found, ${name} can be crafted for ${results[name].craftcost} or bought for ${results[name].tradeCost}`);
    }
  }
}
