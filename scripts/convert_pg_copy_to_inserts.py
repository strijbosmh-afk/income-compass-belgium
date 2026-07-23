#!/usr/bin/env python3
from pathlib import Path
import re

SOURCE = Path("/private/tmp/income-compass-all-data.sql")
OUT_DIR = Path("/private/tmp/income-compass-import")

TABLES = [
    "auth.users",
    "auth.identities",
    "storage.buckets",
    "public.nomenclature_codes",
    "public.income_records",
    "public.income_goals",
    "public.month_closures",
    "public.pension_ipt_records",
    "public.vapz_records",
    "public.vapz_riziv_records",
    "public.pensioensparen_records",
    "public.portfolio_assets",
    "public.portfolio_price_snapshots",
    "storage.objects",
]

COPY_RE = re.compile(r"^COPY\s+([a-z_]+\.[a-z_]+)\s+\((.*)\)\s+FROM stdin;$")


def decode_copy_value(value: str):
    if value == r"\N":
        return None

    out = []
    i = 0
    while i < len(value):
        ch = value[i]
        if ch != "\\":
            out.append(ch)
            i += 1
            continue

        i += 1
        if i >= len(value):
            out.append("\\")
            break

        esc = value[i]
        i += 1
        mapped = {
            "b": "\b",
            "f": "\f",
            "n": "\n",
            "r": "\r",
            "t": "\t",
            "v": "\v",
            "\\": "\\",
        }.get(esc)
        if mapped is not None:
            out.append(mapped)
            continue

        out.append(esc)

    return "".join(out)


def sql_literal(value):
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wanted = set(TABLES)
    current_table = None
    current_columns = None
    rows = {table: [] for table in TABLES}

    for line in SOURCE.read_text().splitlines():
        if current_table:
            if line == r"\.":
                current_table = None
                current_columns = None
                continue
            values = [decode_copy_value(part) for part in line.split("\t")]
            rows[current_table].append(values)
            continue

        match = COPY_RE.match(line)
        if not match:
            continue

        table = match.group(1)
        if table not in wanted:
            current_table = None
            current_columns = None
            continue

        current_table = table
        current_columns = [column.strip() for column in match.group(2).split(",")]
        rows.setdefault(table, [])
        rows[f"{table}.__columns"] = current_columns

    for table in TABLES:
        columns = rows.get(f"{table}.__columns")
        table_rows = rows.get(table, [])
        path = OUT_DIR / f"{table.replace('.', '__')}.sql"
        with path.open("w") as f:
            f.write("begin;\n")
            if table_rows:
                quoted_columns = ", ".join(columns)
                for values in table_rows:
                    literals = ", ".join(sql_literal(value) for value in values)
                    f.write(f"insert into {table} ({quoted_columns}) values ({literals}) on conflict do nothing;\n")
            f.write("commit;\n")
        print(f"{table}: {len(table_rows)} rows -> {path}")


if __name__ == "__main__":
    main()
