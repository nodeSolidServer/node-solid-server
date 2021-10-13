import docker
import pytest
import os


@pytest.fixture(scope="session")
def client():
    return docker.from_env()


@pytest.fixture(scope="session")
def image(client):
    img, _ = client.images.build(path='./src', dockerfile='Dockerfile',
                                 buildargs={"SOLID_SERVER_VERSION": os.environ['SOLID_SERVER_VERSION']})
    return img
