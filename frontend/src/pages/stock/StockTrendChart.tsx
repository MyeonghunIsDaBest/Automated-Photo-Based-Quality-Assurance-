// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockTrendChart.tsx — daily stock movement volume: units IN
// (receipts / transfers in / count-ups) vs units OUT (usage / transfers out /
// count-downs). Two 2px lines on one axis; palette validated for CVD + contrast
// (sage #2F8F5C ↔ orange #C26A2C, ΔE 20.8 worst-case on white).
// ─────────────────────────────────────────────────────────────────────────────

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export interface TrendPoint {
  /** Short display date (e.g. "24/6"). */
  date: string;
  in: number;
  out: number;
}

const IN_COLOR = "#2F8F5C";   // sage — stock coming in
const OUT_COLOR = "#C26A2C";  // orange — stock going out

export default function StockTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div>
      {/* Legend — text wears text tokens; the dot carries identity */}
      <div className="mb-1.5 flex items-center gap-4 text-[11px] font-medium text-[#6B6B6B]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: IN_COLOR }} /> Stock in</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: OUT_COLOR }} /> Stock out</span>
      </div>
      <div className="h-44 sm:h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#EFEBE0" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#6B6B6B" }}
              tickLine={false}
              axisLine={{ stroke: "#E6E1D4" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6B6B6B" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "#D8D2C4", strokeWidth: 1 }}
              contentStyle={{
                background: "#FFFFFF",
                border: "1px solid #E6E1D4",
                borderRadius: 8,
                fontSize: 12,
                boxShadow: "0 4px 16px rgba(20,20,20,0.08)",
              }}
              labelStyle={{ color: "#6B6B6B", fontSize: 11, marginBottom: 2 }}
              formatter={(value, name) => [String(value ?? ""), String(name) === "in" ? "Stock in" : "Stock out"]}
            />
            <Line type="monotone" dataKey="in" stroke={IN_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#FFFFFF" }} />
            <Line type="monotone" dataKey="out" stroke={OUT_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#FFFFFF" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
