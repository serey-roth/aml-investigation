import { Investigator } from "./investigator";
import { SqliteLoader } from "./loader";

const alert = "Account 800737690 has made multiple ACH transfers to different accounts over a short period, flagged as potential fan-out pattern.";

console.log("Running investigation...\n");

const investigator = new Investigator(new SqliteLoader());

investigator.invoke(alert).then((result) => {
  console.log("Agent recommendation:\n", result);
}).catch(console.error);
