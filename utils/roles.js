// server/roles.js
const AccessControl = require("accesscontrol");
const ac = new AccessControl();
"admin",
  "Trainer",
  "Nutrist",
  "Blogger",
  "ShopManager",
  "Customer",
  (exports.roles = (function () {
    ac.grant("customer")
      .readOwn("profile")
      .updateOwn("profile")
      .readAny("post")
      .updateOwn("post");

    ac.grant("trainer")
      .extend("customer")
      .readAny("challenge")
      .updateAny("challenge")
      .deleteAny("challenge");

    ac.grant("nutrist").extend("customer");

    ac.grant("blogger").extend("customer");

    ac.grant("shopmanager").extend("customer");

    ac.grant("admin")
      .extend("customer")
      .extend("trainer")
      .extend("blogger")
      .extend("shopmanager")
      .readAny("profile")
      .updateAny("profile")
      .deleteAny("profile");

    return ac;
  })());
