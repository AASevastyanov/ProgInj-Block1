# Locust Block 2 load test

The Locust scenario drives the main API Gateway flow:

- login as the seeded student
- get zones
- join the dining queue
- poll queue state

Install and run locally after port-forwarding Kong to `localhost:8080`:

```bash
python -m pip install -r tests/locust/requirements.txt
python -m locust -f tests/locust/locustfile.py --host http://localhost:8080/api --headless --users 20 --spawn-rate 2 --run-time 5m
```

The join queue task treats `409` and `429` as expected demonstration outcomes. `409` can happen when the seeded user is already in the queue, and `429` is the rate-limit behavior being demonstrated.
