import "i18next";
import { resources } from "./index";

type AllResources = (typeof resources)["zh-CN"];

declare module "i18next" {
  interface CustomTypeOptions {
    resources: AllResources;
    defaultNS: "common";
  }
}
