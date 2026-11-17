# Reads the holdings of your own DKB depot via FinTS (python-fints) and writes them to a file.
#
# PRIVACY: you type login name and PIN here yourself; they are only held in memory and never
# written, logged or passed on. You confirm the login in the DKB app. Only ISIN, quantity, prices,
# currency and date per position go into the output file, which lives in the temporary folder
# the connector deletes afterwards. Account numbers stay inside this process.
#
# Usage (started by the connector): python fetch_holdings.py <output.json>
# Needs: pip install fints, and STOCKDECK_FINTS_PRODUCT_ID in the environment (your own FinTS
# product registration number; see connectors/README.md).
import json
import logging
import os
import sys
from getpass import getpass

DKB_BLZ = "12030000"
DKB_SERVER = "https://fints.dkb.de/fints"


def fail(msg):
    print(f"Error: {msg}", file=sys.stderr)
    sys.exit(2)


def position(h):
    """Only these fields of a holding leave this process."""
    return {
        "isin": h.ISIN,
        "quantity": h.pieces,
        "price": h.market_value,
        "currency": h.value_symbol,
        "date": h.valuation_date.isoformat() if h.valuation_date else None,
        "acquisition_price": h.acquisitionprice,
    }


def main():
    if len(sys.argv) != 2:
        fail("usage: fetch_holdings.py <output.json>")
    out_path = sys.argv[1]
    product_id = os.environ.get("STOCKDECK_FINTS_PRODUCT_ID", "").strip()
    if not product_id or len(product_id) > 25:
        fail("STOCKDECK_FINTS_PRODUCT_ID is missing or longer than 25 characters (see connectors/README.md).")
    try:
        from fints.client import FinTS3PinTanClient, NeedTANResponse
        from fints.models import SEPAAccount
    except ImportError:
        fail('python-fints is not installed. Run "pip install fints".')

    # python-fints logs whole messages at debug level; keep everything above that off
    logging.disable(logging.WARNING)

    user = input("DKB login name: ").strip()
    pin = getpass("DKB PIN (hidden): ")
    client = FinTS3PinTanClient(DKB_BLZ, user, pin, DKB_SERVER, product_id=product_id)
    del pin

    def confirm(resp):
        while isinstance(resp, NeedTANResponse):
            if resp.decoupled:
                input("Confirm the request in the DKB app, then press Enter here.")
                resp = client.send_tan(resp, "")
            else:
                resp = client.send_tan(resp, getpass("TAN (hidden): "))
        return resp

    # Pick the TAN method; the DKB app (decoupled) is preferred, without printing phone numbers
    if not client.get_current_tan_mechanism():
        client.fetch_tan_mechanisms()
        mechanisms = list(client.get_tan_mechanisms().items())
        if len(mechanisms) > 1:
            for i, (_, m) in enumerate(mechanisms):
                print(f"{i}: {m.name}")
            client.set_tan_mechanism(mechanisms[int(input("TAN method: ").strip() or 0)][0])
    if client.selected_tan_medium is None and client.is_tan_media_required():
        media = client.get_tan_media()[1]
        if len(media) == 1:
            client.set_tan_medium(media[0])
        elif not media:
            client.selected_tan_medium = ""
        else:
            for i, m in enumerate(media):
                print(f"{i}: {m.tan_medium_name}")
            client.set_tan_medium(media[int(input("TAN medium: ").strip() or 0)])

    positions = []
    with client:
        if client.init_tan_response:
            confirm(client.init_tan_response)
        accounts = confirm(client.get_sepa_accounts())
        for account in accounts:
            holdings = confirm(client.get_holdings(account))
            positions.extend(position(h) for h in holdings or [])
        if not positions:
            # Some banks list the depot not among the SEPA accounts. Ask for the depot number;
            # it is only used for this request and never written anywhere.
            depot = input("No depot found among your accounts. Depot number (Enter to skip): ").strip()
            if depot:
                acc = SEPAAccount(iban=None, bic=None, accountnumber=depot, subaccount=None, blz=DKB_BLZ)
                positions.extend(position(h) for h in confirm(client.get_holdings(acc)) or [])

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"format": "dkb-holdings-v1", "positions": positions}, f)
    print(f"{len(positions)} positions read.")


if __name__ == "__main__":
    main()
