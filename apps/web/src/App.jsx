import "./styles.css";
import { SimulationPlayer } from "./components/SimulationPlayer";
import { getClient } from "./sim/api";
import { s03 } from "./sim/mock/fixtures";

export default function App() {
  return <SimulationPlayer scenario={s03} client={getClient()} />;
}