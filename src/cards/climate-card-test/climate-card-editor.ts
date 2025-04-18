import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assert } from "superstruct";
import { fireEvent, LovelaceCardEditor } from "../../ha";
import setupCustomlocalize from "../../localize";
import { computeActionsFormSchema } from "../../shared/config/actions-config";
import { APPEARANCE_FORM_SCHEMA } from "../../shared/config/appearance-config";
import { MushroomBaseElement } from "../../utils/base-element";
import { GENERIC_LABELS } from "../../utils/form/generic-fields";
import { HaFormSchema } from "../../utils/form/ha-form";
import { loadHaComponents } from "../../utils/loader";
import {
  ClimateCardConfig,
  climateCardConfigStruct,
  HVAC_MODES,
} from "./climate-card-config";
import { CLIMATE_CARD_EDITOR_NAME, CLIMATE_ENTITY_DOMAINS } from "./const";

const CLIMATE_LABELS = [
  "hvac_modes", 
  "show_temperature_control", 
  "outside_temperature_entity", 
  "inside_temperature_entity",
  "show_fan_control",
  "graph_entity"
] as const;

@customElement(CLIMATE_CARD_EDITOR_NAME)
export class ClimateCardEditor
  extends MushroomBaseElement
  implements LovelaceCardEditor
{
  @state() private _config?: ClimateCardConfig;

  connectedCallback() {
    super.connectedCallback();
    void loadHaComponents();
  }

  public setConfig(config: ClimateCardConfig): void {
    assert(config, climateCardConfigStruct);
    this._config = config;
  }

  private _computeLabel = (schema: HaFormSchema) => {
    const customLocalize = setupCustomlocalize(this.hass!);

    if (GENERIC_LABELS.includes(schema.name as any)) {
      return customLocalize(`editor.card.generic.${schema.name}`);
    }
    if (CLIMATE_LABELS.includes(schema.name as any)) {
      return customLocalize(`editor.card.climate.${schema.name}`);
    }
    if (schema.name === "inside_temperature_entity") {
      return "Inside Temperature Sensor";
    }
    if (schema.name === "outside_temperature_entity") {
      return "Outside Temperature Sensor";
    }
    if (schema.name === "graph_entity") {
      return "Temperature Graph Sensor";
    }
    return this.hass!.localize(
      `ui.panel.lovelace.editor.card.generic.${schema.name}`
    );
  };

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const schema: HaFormSchema[] = [
      { name: "entity", selector: { entity: { domain: CLIMATE_ENTITY_DOMAINS } } },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} }, context: { icon_entity: "entity" } },
      ...APPEARANCE_FORM_SCHEMA,
      { name: "show_temperature_control", selector: { boolean: {} } },
      { name: "collapsible_controls", selector: { boolean: {} } },
      { name: "show_fan_control", selector: { boolean: {} } },
      {
        name: "hvac_modes",
        selector: {
          select: {
            options: HVAC_MODES.map((mode) => ({
              value: mode,
              label: this.hass!.localize(
                `component.climate.entity_component._.state.${mode}`
              ),
            })),
            mode: "dropdown",
            multiple: true,
          },
        },
      },
      { name: "inside_temperature_entity", selector: { entity: { domain: ["sensor"] } } },
      { name: "outside_temperature_entity", selector: { entity: { domain: ["sensor"] } } },
      { name: "graph_entity", selector: { entity: { domain: ["sensor"] } } },
      ...computeActionsFormSchema(),
    ];

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${schema}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _valueChanged(ev: CustomEvent): void {
    fireEvent(this, "config-changed", { config: ev.detail.value });
  }
}