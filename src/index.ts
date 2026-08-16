import { config } from "./config.js";
import { createApp } from "./app.js";
import { createAppDeps } from "./deps.js";

const app = createApp(createAppDeps());

app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Wavy Tutor listening on http://localhost:${config.PORT} ` +
      `(provider=${config.LLM_PROVIDER})`,
  );
});
