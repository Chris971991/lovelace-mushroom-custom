import { array, assign, boolean, object, optional, string } from "superstruct";
import { HvacMode, LovelaceCardConfig } from "../../ha";
import {
  ActionsSharedConfig,
  actionsSharedConfigStruct,
} from "../../shared/config/actions-config";
import {
  AppearanceSharedConfig,
  appearanceSharedConfigStruct,
} from "../../shared/config/appearance-config";
import {
  EntitySharedConfig,
  entitySharedConfigStruct,
} from "../../shared/config/entity-config";
import { lovelaceCardConfigStruct } from "../../shared/config/lovelace-card-config";

export const HVAC_MODES: HvacMode[] = [
  "auto",
  "heat_cool",
  "heat",
  "cool",
  "dry",
  "fan_only",
  "off",
];

export type ClimateCardConfig = LovelaceCardConfig &
  EntitySharedConfig &
  AppearanceSharedConfig &
  ActionsSharedConfig & {
    show_temperature_control?: boolean;
    hvac_modes?: HvacMode[];
    collapsible_controls?: boolean;
    outside_temperature_entity?: string;
    inside_temperature_entity?: string;
    show_fan_control?: boolean;
    graph_entity?: string;
  };

export const climateCardConfigStruct = assign(
  lovelaceCardConfigStruct,
  assign(
    entitySharedConfigStruct,
    appearanceSharedConfigStruct,
    actionsSharedConfigStruct
  ),
  object({
    show_temperature_control: optional(boolean()),
    hvac_modes: optional(array(string())),
    collapsible_controls: optional(boolean()),
    outside_temperature_entity: optional(string()),
    inside_temperature_entity: optional(string()),
    show_fan_control: optional(boolean()),
    graph_entity: optional(string()),
  })
);