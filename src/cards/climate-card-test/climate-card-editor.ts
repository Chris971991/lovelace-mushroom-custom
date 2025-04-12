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
  ClimateCardTestConfig,
  climateCardTestConfigStruct,
  HVAC_MODES,
} from "./climate-card-config";
import { CLIMATE_CARD_EDITOR_NAME, CLIMATE_ENTITY_DOMAINS } from "./const";

const CLIMATE_LABELS = [
  "hvac_modes",
  "show_temperature_control",
  "outside_temperature_entity",
  "inside_temperature_entity",
  "show_fan_control",
  "show_graph",
  "graph_entity",
  "graph_hours",
  "graph_height",
  "graph_line_color",
  "graph_fill_color",
  "graph_alpha",
  "graph_curve_tension",
  "graph_line_width",
  "graph_style"
] as const;

@customElement(CLIMATE_CARD_EDITOR_NAME)
export class ClimateCardTestEditor
  extends MushroomBaseElement
  implements LovelaceCardEditor
{
  @state() private _config?: ClimateCardTestConfig;

  connectedCallback() {
    super.connectedCallback();
    void loadHaComponents();
  }
  public setConfig(config: ClimateCardTestConfig): void {
    assert(config, climateCardTestConfigStruct);
    this._config = config;
  }

  private _computeLabel = (schema: HaFormSchema) => {
    const customLocalize = setupCustomlocalize(this.hass!);

    if (GENERIC_LABELS.includes(schema.name as any)) {
      return customLocalize(`editor.card.generic.${schema.name}`);
    }
    
    // Special handling for section headers - return empty string to avoid duplication
    if (schema.type === "constant") {
      return "";
    }
    
    // User-friendly labels for all fields
    if (schema.name === "entity") return "Climate Entity";
    if (schema.name === "name") return "Card Name";
    if (schema.name === "icon") return "Icon";
    
    // Controls
    if (schema.name === "show_temperature_control") return "Show Temperature Controls";
    if (schema.name === "collapsible_controls") return "Collapsible Controls";
    if (schema.name === "show_fan_control") return "Show Fan Controls";
    if (schema.name === "hvac_modes") return "Available HVAC Modes";
    
    // Temperature Sensors
    if (schema.name === "inside_temperature_entity") return "Indoor Temperature Sensor";
    if (schema.name === "outside_temperature_entity") return "Outdoor Temperature Sensor";
    
    // Graph Settings
    if (schema.name === "show_graph") return "Show Temperature Graph";
    if (schema.name === "graph_entity") return "Graph Data Source";
    if (schema.name === "graph_hours") return "History Period (hours)";
    if (schema.name === "graph_height") return "Graph Height";
    
    // Graph Appearance - use Unicode symbols for color selectors
    if (schema.name === "graph_line_color") return "Line Color";
    if (schema.name === "graph_fill_color") return "Fill Color";
    if (schema.name === "graph_alpha") return "Graph Transparency";
    if (schema.name === "graph_line_width") return "Line Thickness (0 = no line)";
    if (schema.name === "graph_curve_tension") return "Curve Smoothness";
    if (schema.name === "graph_style") return "Graph Style";
    
    // Default to climate labels
    if (CLIMATE_LABELS.includes(schema.name as any)) {
      return customLocalize(`editor.card.climate.${schema.name}`);
    }
    
    // Fallback to HA localization
    return this.hass!.localize(
      `ui.panel.lovelace.editor.card.generic.${schema.name}`
    );
  };

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const schema: HaFormSchema[] = [
      // Basic card configuration
      { name: "entity", selector: { entity: { domain: CLIMATE_ENTITY_DOMAINS } } },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} }, context: { icon_entity: "entity" } },
      ...APPEARANCE_FORM_SCHEMA,
      
      // Section divider for Controls
      { type: "constant", name: "controls_header", value: "⚙️  Controls" },
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
      
      // Section divider for Temperature Sensors
      { type: "constant", name: "sensors_header", value: "🌡️  Temperature Sensors" },
      { name: "inside_temperature_entity", selector: { entity: { domain: ["sensor"] } } },
      { name: "outside_temperature_entity", selector: { entity: { domain: ["sensor"] } } },
      
      // Section divider for Graph Settings
      { type: "constant", name: "graph_header", value: "📊  Temperature Graph" },
      { name: "show_graph", selector: { boolean: {} } },
      { name: "graph_entity", selector: { entity: { domain: ["sensor"] } } },
      { name: "graph_hours", selector: { number: { min: 1, max: 168, mode: "slider", step: 1 } } },
      { name: "graph_height", selector: { number: { min: 40, max: 100, mode: "slider", step: 10 } } },
      
      // Graph Appearance
      { type: "constant", name: "graph_appearance_header", value: "🎨  Graph Appearance" },
      // Add a spacer to create some visual separation
      { type: "constant", name: "spacer1", value: " " },
      // Color selectors without headers
      { name: "graph_line_color", selector: { text: { type: "color" } } },
      // Add a spacer to create some visual separation
      { type: "constant", name: "spacer2", value: " " },
      // Color selectors without headers
      { name: "graph_fill_color", selector: { text: { type: "color" } } },
      { name: "graph_alpha", selector: { number: { min: 0, max: 1, mode: "slider", step: 0.05 } } },
      { name: "graph_line_width", selector: { number: { min: 0, max: 10, mode: "slider", step: 1 } } },
      { name: "graph_curve_tension", selector: { number: { min: 0.1, max: 1, mode: "slider", step: 0.05 } } },
      {
        name: "graph_style",
        selector: {
          select: {
            options: [
              { value: "smooth", label: "Smooth" },
              { value: "sharp", label: "Sharp" }
            ],
            mode: "dropdown"
          }
        }
      },
      
      // Actions
      { type: "constant", name: "actions_header", value: "🖱️  Actions" },
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