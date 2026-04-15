import { Investigator } from "./investigator";
import { StubLoader } from "./loaders";

const alert = "Account ACC-001 made 4 cash deposits in 8 days: $9,800, $9,500, $9,700, $9,600.";

console.log("Running investigation...\n");

const investigator = new Investigator(new StubLoader());

investigator.invoke(alert).then((result) => {
  console.log("Agent recommendation:\n", result);
}).catch(console.error);
