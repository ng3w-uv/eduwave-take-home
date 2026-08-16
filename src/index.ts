import { config } from "./config.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Wavy Tutor listening on http://localhost:${config.PORT} ` +
      `(provider=${config.LLM_PROVIDER})`,
  );
});
