import os
from random import choice

from locust import HttpUser, between, task


STUDENT_EMAIL = os.getenv("LOCUST_STUDENT_EMAIL", "student@example.com")
STUDENT_PASSWORD = os.getenv("LOCUST_STUDENT_PASSWORD", "Password123!")


class GatewayUser(HttpUser):
    wait_time = between(0.5, 2.0)
    token = None
    dining_zone_id = None

    def on_start(self):
        self.login()
        self.load_zones()

    def auth_headers(self):
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    def login(self):
        with self.client.post(
            "/auth/login",
            json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD},
            name="login",
            catch_response=True,
        ) as response:
            if response.status_code != 201 and response.status_code != 200:
                response.failure(f"login failed: {response.status_code} {response.text}")
                return
            payload = response.json()
            self.token = payload.get("token")
            if not self.token:
                response.failure("login response did not include token")

    def load_zones(self):
        with self.client.get("/zones", headers=self.auth_headers(), name="get zones", catch_response=True) as response:
            if response.status_code != 200:
                response.failure(f"zones failed: {response.status_code} {response.text}")
                return
            zones = response.json()
            dining = [zone for zone in zones if zone.get("type") == "dining_zone"]
            if dining:
                self.dining_zone_id = choice(dining).get("id")
            else:
                response.failure("no dining zone returned")

    @task(5)
    def get_zones(self):
        self.client.get("/zones", headers=self.auth_headers(), name="get zones")

    @task(3)
    def join_queue(self):
        if not self.dining_zone_id:
            self.load_zones()
        if not self.dining_zone_id:
            return

        with self.client.post(
            f"/queues/{self.dining_zone_id}/join",
            headers=self.auth_headers(),
            name="join queue",
            catch_response=True,
        ) as response:
            if response.status_code in (200, 201, 204, 409, 429):
                response.success()
            else:
                response.failure(f"unexpected join queue status: {response.status_code} {response.text}")

    @task(1)
    def queue_state(self):
        if self.dining_zone_id:
            with self.client.get(
                f"/queues/{self.dining_zone_id}/state",
                headers=self.auth_headers(),
                name="queue state",
                catch_response=True,
            ) as response:
                if response.status_code in (200, 429):
                    response.success()
                else:
                    response.failure(f"unexpected queue state status: {response.status_code} {response.text}")
